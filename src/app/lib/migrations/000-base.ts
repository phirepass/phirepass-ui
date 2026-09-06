import type { Migration } from './types';

/**
 * The tables that existed before anything here was a migration.
 *
 * `users`, `pat_tokens`, `nodes` and `auth_challenges` are the original schema,
 * shared with `phirepass-rs` and documented in its `README.md`. Until now
 * nothing created them: a fresh deployment had to be seeded by hand before
 * either application would work.
 *
 * They are here so that **starting the app against an empty database is enough**.
 * On every existing deployment this is a no-op — every statement is
 * `IF NOT EXISTS`, and nothing alters a column that is already there — but it
 * has to run *first*, because `001-organizations` adds foreign keys to `users`
 * and would otherwise fail on a new install with an error about a missing
 * relation rather than an obvious "there is no schema here".
 *
 * Two things this deliberately does **not** do:
 *
 * - **No `pg_cron`.** The original schema scheduled a cleanup job for expired
 *   `auth_challenges`. `CREATE EXTENSION` needs privileges the application role
 *   often does not hold, and a failure here would be an error on every boot
 *   rather than a schema that is simply already applied. Expired challenges are
 *   refused on read (`server/src/node_auth.rs` checks `expires_at`), so the job
 *   reclaims space rather than enforcing anything. The `DO` block below adds it
 *   when it can and says nothing when it cannot.
 * - **No column changes to existing tables.** Anything that alters what is
 *   already there belongs in its own numbered migration, where it can be read
 *   and sequenced. This one only ever creates.
 */
export const base: Migration = {
    id: '000-base',
    description: 'users, pat_tokens, nodes and auth_challenges',
    sql: `
-- gen_random_uuid() lives in pgcrypto before Postgres 13 and in core after it.
-- Requested rather than required: on a managed instance it is usually already
-- there, and the DO block keeps a role without CREATE EXTENSION from failing.
DO $ext$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
    EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
        RAISE NOTICE 'pgcrypto not installed and cannot be created; assuming gen_random_uuid() is built in';
    END;
END
$ext$;

CREATE TABLE IF NOT EXISTS users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    updated_at    timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    provider      text        NOT NULL,
    email         text        NOT NULL UNIQUE,
    password      text,
    username      text        NOT NULL,
    avatar_url    text        NOT NULL,
    roles         text[]      NOT NULL DEFAULT '{user}'
);

CREATE TABLE IF NOT EXISTS pat_tokens (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id      text        NOT NULL UNIQUE,
    token_hash    text        NOT NULL,
    user_id       uuid        NOT NULL REFERENCES users(id),
    name          text        NOT NULL DEFAULT '',
    scopes        text[]      NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    expires_at    timestamptz,
    last_used_at  timestamptz
);

CREATE TABLE IF NOT EXISTS nodes (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES users(id),
    name          text,
    public_key    text        NOT NULL UNIQUE,
    hostname      text        NOT NULL DEFAULT '',
    metadata      jsonb       NOT NULL DEFAULT '{}',
    settings      jsonb,
    created_at    timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    last_seen     timestamptz,
    revoked       boolean     NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS auth_challenges (
    node_id       uuid        PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    challenge     text        NOT NULL,
    expires_at    timestamptz NOT NULL
);

-- Expired challenges are already refused on read; this only reclaims the rows.
-- Skipped without complaint where pg_cron is unavailable.
DO $cron$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
       AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phirepass-auth-challenge-cleanup')
    THEN
        PERFORM cron.schedule(
            'phirepass-auth-challenge-cleanup',
            '* * * * *',
            $job$DELETE FROM auth_challenges WHERE expires_at <= NOW();$job$
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'could not schedule the auth-challenge cleanup job: %', SQLERRM;
END
$cron$;
`,
};
