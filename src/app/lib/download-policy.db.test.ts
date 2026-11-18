import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import pg from 'pg';

import { LIST_POLICIES_SQL, SET_POLICY_SQL, forbiddenKinds, parsePolicy, type DownloadPolicy } from './download-policy.ts';

/**
 * Setting a node's download policy, executed by Postgres. Opt-in like
 * `scope.db.test.ts`; it **creates and drops its own schema**. Never point it
 * at anything real.
 *
 *     PG_TEST_URL=postgres://postgres:test@127.0.0.1:55433/phirepass npm test
 */
const PG_TEST_URL = process.env.PG_TEST_URL;

test('only the three policies parse', () => {
    assert.equal(parsePolicy('links_only'), 'links_only');
    assert.equal(parsePolicy('Blocked'), null);
    assert.equal(parsePolicy(undefined), null);
    assert.deepEqual(forbiddenKinds('allowed'), []);
});

describe('download policy, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;
    const SCHEMA = 'download_policy_test';
    const id: Record<string, string> = {};

    const uuid = async () => (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id as string;

    const SERVICES = [
        { id: 'a', kind: 'SSH', port: 22 },
        { id: 'b', kind: 'FETCH', port: 0 },
        { id: 'c', kind: 'TORRENT', port: 0 },
    ];

    async function set(node: string, org: string, policy: DownloadPolicy, who = id.admin) {
        const result = await client.query(SET_POLICY_SQL, [id[node], org, policy, who, forbiddenKinds(policy)]);
        return result.rows[0] as { saved: number; stripped: number };
    }

    async function kinds(node: string): Promise<string[]> {
        const row = (await client.query('SELECT settings FROM nodes WHERE id = $1', [id[node]])).rows[0];
        return (row.settings.services as { kind: string }[]).map((s) => s.kind);
    }

    async function policy(node: string): Promise<string | null> {
        const row = (await client.query('SELECT policy FROM node_download_policy WHERE node_id = $1', [id[node]])).rows[0];
        return row?.policy ?? null;
    }

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);
        await client.query(`
            CREATE TABLE users (id uuid PRIMARY KEY, username text, email text);
            CREATE TABLE nodes (id uuid PRIMARY KEY, user_id uuid NOT NULL, org_id uuid, name text, settings jsonb);
            CREATE TABLE node_download_policy (
                node_id uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
                policy text NOT NULL DEFAULT 'allowed' CHECK (policy IN ('allowed', 'links_only', 'blocked')),
                changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
                changed_at timestamptz NOT NULL DEFAULT now());
            CREATE TABLE downloads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), node_id uuid NOT NULL,
                wanted text NOT NULL, state text NOT NULL);`);
        for (const key of ['orgA', 'orgB', 'admin', 'owner']) id[key] = await uuid();
        await client.query('INSERT INTO users VALUES ($1, $2, $3), ($4, $5, $6)',
            [id.admin, 'ana', 'ana@example.org', id.owner, null, 'bo@example.org']);
    });

    beforeEach(async () => {
        await client.query('TRUNCATE downloads, node_download_policy, nodes');
        for (const [label, org] of [['pi', id.orgA], ['nas', id.orgA], ['theirs', id.orgB], ['unclaimed', null]] as const) {
            id[label] = await uuid();
            await client.query('INSERT INTO nodes VALUES ($1, $2, $3, $4, $5)',
                [id[label], id.owner, org, label, { services: SERVICES }]);
        }
    });

    after(async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    test('blocked removes both switches in the same statement and keeps the rest', async () => {
        assert.deepEqual(await set('pi', id.orgA, 'blocked'), { saved: 1, stripped: 2 });
        assert.deepEqual(await kinds('pi'), ['SSH']);
        assert.equal(await policy('pi'), 'blocked');
    });

    test('links only removes Torrents and leaves Downloads', async () => {
        assert.deepEqual(await set('pi', id.orgA, 'links_only'), { saved: 1, stripped: 1 });
        assert.deepEqual(await kinds('pi'), ['SSH', 'FETCH']);
    });

    test('allowed changes no service, and a second change rewrites the row', async () => {
        await set('pi', id.orgA, 'blocked');
        assert.deepEqual(await set('pi', id.orgA, 'allowed', id.owner), { saved: 1, stripped: 0 });
        assert.equal(await policy('pi'), 'allowed');
        const row = (await client.query('SELECT changed_by FROM node_download_policy WHERE node_id = $1', [id.pi])).rows[0];
        assert.equal(row.changed_by, id.owner);
    });

    test("another organisation's node, or an unclaimed one, is not touched", async () => {
        assert.deepEqual(await set('theirs', id.orgA, 'blocked'), { saved: 0, stripped: 0 });
        assert.deepEqual(await set('unclaimed', id.orgA, 'blocked'), { saved: 0, stripped: 0 });
        assert.deepEqual(await kinds('theirs'), ['SSH', 'FETCH', 'TORRENT']);
        assert.equal(await policy('theirs'), null);
    });

    test('the list covers the organisation only, with who changed it and what runs', async () => {
        await set('nas', id.orgA, 'blocked');
        await client.query(`INSERT INTO downloads (node_id, wanted, state) VALUES
            ($1, 'running', 'Downloading'), ($1, 'running', 'Seeding'), ($1, 'stopped', 'Stopped'), ($1, 'running', 'Completed')`,
            [id.pi]);

        const rows = (await client.query(LIST_POLICIES_SQL, [id.orgA])).rows;
        assert.deepEqual(rows.map((r) => [r.name, r.policy, r.downloads_on, r.running]), [
            ['nas', 'blocked', false, 0],
            ['pi', 'allowed', true, 2],
        ]);
        assert.equal(rows[0].changed_by_username, 'ana');
    });
});
