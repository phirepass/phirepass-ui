import { query } from "./db.ts";

/**
 * ⚠️ TEMPORARY — DELETE THIS FILE ON THE NEXT UI DEPLOYMENT ⚠️
 *
 * The two tables two-factor authentication needs, created by the app itself the
 * first time it starts against a database that does not have them.
 *
 * This repo has no migration runner: every other table was applied by hand from
 * a file in `docs/` before the deploy that needed it. Carrying the DDL in the
 * image instead means the release that introduces 2FA cannot land on a database
 * that is a step behind it — which is the whole reason this is here, and also
 * the whole reason it should not stay.
 *
 * **Removing it**, once every environment has started this build at least once
 * (check with `SELECT to_regclass('public.user_mfa')`):
 *
 *   1. delete this file and `src/instrumentation.ts`
 *   2. move the SQL below into `docs/mfa-schema.sql`, beside the other schemas,
 *      for the record of how the tables were made
 *
 * Leaving it in is not harmful — after the first run it is one cheap catalogue
 * lookup per boot — but a server that silently rewrites its own schema is a
 * surprise waiting for whoever debugs the next migration, and it means the
 * application's database user must keep DDL rights it otherwise would not need.
 */

/**
 * Guarded by `to_regclass` rather than written as `CREATE TABLE IF NOT EXISTS`
 * alone, so a database that already has these tables is never issued DDL at
 * all: an app that boots without CREATE rights should be able to start, not
 * fail on a statement that would have been a no-op.
 */
const CREATE_SQL = `
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
`;

/**
 * Runs at most once per process, whatever calls it and however often.
 *
 * The promise is memoised rather than a boolean flag because two requests can
 * arrive before the first CREATE returns; both then await the same work. A
 * failure is memoised too — retrying DDL on every request against a database
 * that refused it once would turn a permissions problem into a log flood.
 */
let ensured: Promise<void> | null = null;

export function ensureMfaSchema(): Promise<void> {
    ensured ??= createIfMissing();
    return ensured;
}

async function createIfMissing(): Promise<void> {
    try {
        const existing = await query(`SELECT to_regclass('public.user_mfa') AS table_name`);
        if (existing.rows[0]?.table_name) return;

        console.log("[mfa] user_mfa not found, creating two-factor tables");

        // One transaction: a half-created pair — the secret table without the
        // recovery codes — would let someone enrol into an account they could
        // then be locked out of.
        await query("BEGIN");
        try {
            await query(CREATE_SQL);
            await query("COMMIT");
        } catch (e) {
            await query("ROLLBACK").catch(() => {});
            throw e;
        }

        console.log("[mfa] two-factor tables created");
    } catch (e) {
        // Not fatal to the server. Everything else in the dashboard works
        // without these tables; the 2FA endpoints are what fail, and they fail
        // with their own error rather than taking the process down at boot.
        console.warn("[mfa] could not ensure two-factor tables", e);
    }
}
