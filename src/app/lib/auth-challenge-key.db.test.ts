import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { base } from './migrations/000-base.ts';
import { authChallengeKey } from './migrations/008-auth-challenge-key.ts';

/**
 * `auth_challenges` ends up keyed on `(node_id, challenge)` whichever way the
 * table started, and the server's own insert then works. Opt-in like the other
 * `*.db.test.ts`; each case runs in a schema of its own.
 */
const PG_TEST_URL = process.env.PG_TEST_URL;

/** The statement `insert_auth_challenge` runs (`phirepass-rs/server/src/db/postgres.rs`). */
const SERVER_INSERT = `INSERT INTO auth_challenges (node_id, challenge, expires_at)
    VALUES ($1, $2, now() + interval '60 seconds')
    ON CONFLICT (node_id, challenge) DO NOTHING`;

const NODE = '7f1c2a9e-0000-4000-8000-000000000001';

describe('auth_challenges key, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;
    const SCHEMA = 'auth_challenge_key_test';

    const fresh = async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);
    };

    const primaryKey = async () =>
        (await client.query(`SELECT array_agg(a.attname::text ORDER BY a.attname) AS cols
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
            WHERE c.conrelid = to_regclass('auth_challenges') AND c.contype = 'p'`)).rows[0].cols;

    /** Two outstanding challenges for one node, and a repeat that is a no-op. */
    const serverInsertsWork = async () => {
        await client.query(SERVER_INSERT, [NODE, 'first']);
        await client.query(SERVER_INSERT, [NODE, 'second']);
        await client.query(SERVER_INSERT, [NODE, 'second']);
        const n = (await client.query('SELECT count(*)::int AS n FROM auth_challenges')).rows[0].n;
        assert.equal(n, 2);
    };

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();
    });

    after(async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    test('a new database gets the wide key from 000-base, and 008 leaves it alone', async () => {
        await fresh();
        await client.query(base.sql);
        assert.deepEqual(await primaryKey(), ['challenge', 'node_id'], '000-base itself creates the wide key');
        await client.query(authChallengeKey.sql);
        assert.deepEqual(await primaryKey(), ['challenge', 'node_id']);
        await client.query(`INSERT INTO users (id, provider, email, username, avatar_url)
            VALUES (gen_random_uuid(), 'test', 'k@key.test', 'k', '') `);
        await client.query(`INSERT INTO nodes (id, user_id, public_key)
            SELECT $1, id, 'pk' FROM users LIMIT 1`, [NODE]);
        await serverInsertsWork();
    });

    test('a table created with the old node_id key is repaired, keeping its rows, and twice is a no-op', async () => {
        await fresh();
        await client.query(`CREATE TABLE nodes (id uuid PRIMARY KEY)`);
        await client.query(`INSERT INTO nodes VALUES ($1)`, [NODE]);
        await client.query(`CREATE TABLE auth_challenges (
            node_id uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
            challenge text NOT NULL, expires_at timestamptz NOT NULL)`);
        await client.query(`INSERT INTO auth_challenges VALUES ($1, 'kept', now())`, [NODE]);
        await assert.rejects(client.query(SERVER_INSERT, [NODE, 'x']), /no unique or exclusion constraint/);

        await client.query(authChallengeKey.sql);
        await client.query(authChallengeKey.sql);
        assert.deepEqual(await primaryKey(), ['challenge', 'node_id']);
        assert.equal((await client.query(`SELECT challenge FROM auth_challenges`)).rows[0].challenge, 'kept');
        await client.query('DELETE FROM auth_challenges');
        await serverInsertsWork();
        const cascade = await client.query(`SELECT confdeltype FROM pg_constraint
            WHERE conrelid = to_regclass('auth_challenges') AND contype = 'f'`);
        assert.equal(cascade.rows[0].confdeltype, 'c', 'the foreign key to nodes survives');
    });

    test('a bare unique index on the two columns is already enough (no new key)', async () => {
        await fresh();
        await client.query(`CREATE TABLE auth_challenges (node_id uuid NOT NULL, challenge text NOT NULL,
            expires_at timestamptz NOT NULL)`);
        await client.query(`CREATE UNIQUE INDEX ac_pair ON auth_challenges (challenge, node_id)`);
        await client.query(authChallengeKey.sql);
        assert.equal(await primaryKey(), null);
        await serverInsertsWork();
    });

    test('a table with no key at all gets one', async () => {
        await fresh();
        await client.query(`CREATE TABLE auth_challenges (node_id uuid NOT NULL, challenge text NOT NULL,
            expires_at timestamptz NOT NULL)`);
        await client.query(authChallengeKey.sql);
        assert.deepEqual(await primaryKey(), ['challenge', 'node_id']);
    });

    test('an unexpected key is refused loudly, not guessed at', async () => {
        await fresh();
        await client.query(`CREATE TABLE auth_challenges (node_id uuid NOT NULL, challenge text PRIMARY KEY,
            expires_at timestamptz NOT NULL)`);
        await assert.rejects(client.query(authChallengeKey.sql), /unexpected primary key/);
    });
});
