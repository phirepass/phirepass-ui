-- Web Push subscriptions.
--
-- One row per *browser*, not per person: a push subscription is issued by the
-- browser's own push service, so the same laptop signed into the same account
-- in both Safari and Chrome is two rows. `endpoint` is what the push service
-- gives back and is globally unique, which makes it the natural conflict key —
-- re-enabling in a browser that already has a subscription refreshes the row
-- rather than accumulating duplicates.
--
-- There is no migration runner in either repo, so this file is applied by hand:
--
--     psql "$DATABASE_URL" -f docs/notifications-schema.sql
--
-- or, reusing the app's own TLS handling:
--
--     node scripts/apply-notifications-schema.mjs --check
--     node scripts/apply-notifications-schema.mjs --apply
--
-- It is written to be re-runnable (IF NOT EXISTS throughout).

-- ─────────────────────────────────────────────────────────────────────────────
-- Rename: push_subscriptions → notification_subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The table was originally named for its mechanism (Web Push). It is named for
-- its role now, so it sits with `notification_preferences` rather than beside
-- it under a different vocabulary.
--
-- Guarded on both sides so this file stays re-runnable: it fires only when the
-- old name exists and the new one does not. On a fresh database nothing matches
-- and the CREATE below does the work instead.
--
-- Renaming a table does not rename the indexes and constraints hanging off it,
-- so those are renamed explicitly — otherwise a fresh install and a migrated one
-- end up with the same table and differently named constraints, which is exactly
-- the sort of drift that makes the next migration fail on one and not the other.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'notification_subscriptions'
    ) THEN
        ALTER TABLE push_subscriptions RENAME TO notification_subscriptions;

        ALTER INDEX IF EXISTS push_subscriptions_pkey
            RENAME TO notification_subscriptions_pkey;
        ALTER INDEX IF EXISTS push_subscriptions_endpoint_key
            RENAME TO notification_subscriptions_endpoint_key;
        ALTER INDEX IF EXISTS push_subscriptions_user_id_idx
            RENAME TO notification_subscriptions_user_id_idx;
    END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_subscriptions — one row per browser that accepted notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The push service URL. Unique across the whole table, not just per user:
    -- the endpoint identifies the browser instance, and two accounts cannot
    -- legitimately hold the same one.
    endpoint       text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 1 AND 2048),

    -- The two halves of the ECDH key material the push service needs in order
    -- for the payload to be encrypted end to end. Opaque base64url; the server
    -- only ever hands them to `web-push`.
    p256dh         text NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 512),
    auth           text NOT NULL CHECK (length(auth) BETWEEN 1 AND 512),

    -- Display only, derived from the user agent at registration. Nullable
    -- because none of it is load-bearing: a row with no label still delivers.
    label          text,
    platform       text CHECK (platform IS NULL OR platform IN
                        ('macos', 'windows', 'linux', 'ios', 'android')),
    browser        text,

    created_at     timestamptz NOT NULL DEFAULT now(),
    -- Bumped whenever the browser re-subscribes or a send to it succeeds, which
    -- is the only signal available that the subscription is still live.
    last_active_at timestamptz NOT NULL DEFAULT now()
);

-- Every read is "the current user's devices", so the user_id index is the one
-- that matters. The endpoint already has a unique index from the constraint.
CREATE INDEX IF NOT EXISTS notification_subscriptions_user_id_idx
    ON notification_subscriptions (user_id, last_active_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_preferences — which events a person wants, per account
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One row per user, holding a jsonb object of `event id -> boolean`, rather than
-- a row per event or a column per event. The event catalogue is defined in code
-- (src/types/notification.ts) and is expected to grow; a column-per-event schema
-- would need a migration every time one is added, and a row-per-event table
-- would need backfilling for every existing user before the new event had an
-- answer.
--
-- With jsonb, the stored object is a set of *overrides*: anything absent falls
-- back to that event's `defaultEnabled` in code. So adding an event ships with
-- its intended default already applied to everyone, and no data migration.
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Constrained to an object so a stray array or scalar cannot be written and
    -- then crash every read of this row.
    events     jsonb NOT NULL DEFAULT '{}'::jsonb
                   CHECK (jsonb_typeof(events) = 'object'),

    updated_at timestamptz NOT NULL DEFAULT now()
);
