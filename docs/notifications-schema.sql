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

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_webhooks — the other delivery channel
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Web push reaches a *person* at a browser they had to grant permission in;
-- a webhook reaches a *system* at a URL, with no permission step and no
-- expiry. Same events, same preferences row, different transport — which is
-- exactly the split the courier already models as `NotificationKind`
-- (`web.push` | `webhook` | `email`) in phirepass-rs/common/src/notifications.rs.
--
-- Not folded into `notification_subscriptions` with a `kind` column, because
-- almost nothing is shared: a subscription carries ECDH key material and is
-- issued (and revoked) by a browser's push service, while an endpoint carries a
-- signing secret and is typed in by hand. Merging them would give one table two
-- disjoint sets of NOT NULLs and a CHECK constraint to police which half
-- applies.
CREATE TABLE IF NOT EXISTS notification_webhooks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Display label. Nullable like the subscription's, and for the same reason:
    -- a row with no name still delivers.
    label         text,

    -- Where the POST goes. Not globally unique, unlike a push endpoint — two
    -- accounts pointing at the same team's Slack relay is legitimate — so the
    -- uniqueness that matters is per user, and it lives in the index below.
    url           text NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),

    -- Shared secret for the HMAC in `X-Phirepass-Signature`. Stored in the clear
    -- on purpose: signing needs the original bytes at send time, so a hash here
    -- would make the header unforgeable by us as well as by an attacker. It is
    -- shown to the person once, at creation, and only ever hinted at afterwards.
    secret        text NOT NULL CHECK (length(secret) BETWEEN 16 AND 128),

    -- Paused rather than deleted. Endpoints get switched off while the receiving
    -- system is being worked on, and re-typing the URL and re-pasting the secret
    -- into the receiver is a poor substitute for a switch.
    enabled       boolean NOT NULL DEFAULT true,

    created_at    timestamptz NOT NULL DEFAULT now(),

    -- Last attempt, whatever it returned. All three move together, and all three
    -- are null until something has actually been sent: "never delivered" and
    -- "delivered, failed" are different states and the list says which.
    last_sent_at  timestamptz,
    last_status   integer CHECK (last_status IS NULL OR last_status BETWEEN 0 AND 599),
    last_error    text,

    -- Consecutive failures; reset to 0 by any 2xx. Nothing disables an endpoint
    -- on this count yet — it is what the list sorts its warnings by.
    fail_count    integer NOT NULL DEFAULT 0 CHECK (fail_count >= 0)
);

-- Every read is "the current user's endpoints", ordered oldest first so the list
-- does not reshuffle when one is edited.
CREATE INDEX IF NOT EXISTS notification_webhooks_user_id_idx
    ON notification_webhooks (user_id, created_at);

-- One URL per account. Adding the same endpoint twice is a mistake every time —
-- it doubles delivery to a system that has no way to tell the two apart.
CREATE UNIQUE INDEX IF NOT EXISTS notification_webhooks_user_url_idx
    ON notification_webhooks (user_id, url);
