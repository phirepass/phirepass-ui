-- Two-factor authentication (TOTP).
--
-- Two tables, both keyed on the account: the authenticator's shared secret, and
-- the recovery codes that stand in for a lost phone. Neither is a column on
-- `users`, so a row simply not existing is the ordinary state of an account
-- without 2FA, and turning 2FA off is a delete rather than a set of nullable
-- columns left behind holding a live secret.
--
-- These tables were created by the application itself, at startup, for the one
-- release that introduced 2FA — the alternative was a deploy that could land on
-- a database a step behind it. That bootstrap has since been removed, and this
-- file is the record of what it ran; every deployed environment already has
-- both tables.
--
-- There is no migration runner in either repo, so on a fresh database this is
-- applied by hand, like the schemas beside it:
--
--     psql "$DATABASE_URL" -f docs/mfa-schema.sql
--
-- It is written to be re-runnable (IF NOT EXISTS throughout).

-- ─────────────────────────────────────────────────────────────────────────────
-- user_mfa — one row per account that has started enrolling an authenticator
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A row exists from the moment the QR code is shown, which is the only way the
-- server can check the first code the person types. Until confirmed_at is set,
-- that row is inert: it does not gate sign-in, and starting enrolment again
-- overwrites it. Only a confirmed row means "this account has 2FA".
CREATE TABLE IF NOT EXISTS user_mfa (
    user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- The TOTP secret, encrypted with a key derived from JWT_SECRET (see
    -- mfa.ts). Never the raw base32: a database dump on its own is then not
    -- enough to mint valid codes for every account in it. The stored form
    -- carries a version prefix so the scheme can change without guessing at
    -- what old rows hold.
    secret       text NOT NULL CHECK (length(secret) BETWEEN 1 AND 512),

    -- NULL while the person has scanned the QR but not yet proved they can read
    -- a code off it. Set once, on the first correct code.
    confirmed_at timestamptz,

    -- The last TOTP step this account successfully spent.
    --
    -- A code is valid for its whole 30-second step (and the server accepts one
    -- step either side), so without this a code read over a shoulder or lifted
    -- from a phishing page is replayable until it rolls. Verification refuses
    -- any step at or below this one, making every code exactly single-use.
    last_step    bigint,

    last_used_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- user_mfa_recovery_codes — the way back in without the phone
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Issued as a batch when 2FA is switched on and replaced wholesale rather than
-- topped up, so "four left" is always true of one printed list. Spent codes are
-- kept (used_at rather than DELETE) so that count is honest.
CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- SHA-256 of the normalised code, hex.
    --
    -- Deliberately not argon2, which the app uses elsewhere: a recovery code is
    -- 50 bits of machine-generated randomness, not a human password, so there
    -- is no dictionary to slow down and nothing for a rainbow table to
    -- precompute. What a fast digest buys is an indexed equality lookup — one
    -- query — where a stretched hash would force ten verifications per attempt,
    -- and ten argon2 runs on a pre-session endpoint is a denial-of-service
    -- lever pointed at ourselves.
    code_hash  text NOT NULL CHECK (length(code_hash) = 64),

    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The lookup verification actually makes: this user's unused codes, by hash.
CREATE INDEX IF NOT EXISTS user_mfa_recovery_codes_lookup_idx
    ON user_mfa_recovery_codes (user_id, code_hash)
    WHERE used_at IS NULL;

-- The count shown in Settings, and the delete when codes are regenerated.
CREATE INDEX IF NOT EXISTS user_mfa_recovery_codes_user_id_idx
    ON user_mfa_recovery_codes (user_id);

-- A code is one account's. Globally unique hashes would also leak that two
-- accounts drew the same string, which is a coincidence, not an error.
CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_recovery_codes_unique_idx
    ON user_mfa_recovery_codes (user_id, code_hash);
