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
-- push_subscriptions — one row per browser that has accepted notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
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
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
    ON push_subscriptions (user_id, last_active_at DESC);
