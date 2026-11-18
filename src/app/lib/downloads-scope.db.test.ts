import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { downloadsQuery, type DownloadsShape } from './downloads-scope.ts';

/**
 * Which downloads `/api/downloads` returns, executed by Postgres.
 *
 * Opt-in like `scope.db.test.ts`: it needs a scratch database and **creates and
 * drops its own schema**. Never point it at anything real.
 *
 *     docker run -d --name pg-test -e POSTGRES_PASSWORD=test \
 *       -e POSTGRES_DB=phirepass -p 55433:5432 postgres:16-alpine
 *     PG_TEST_URL=postgres://postgres:test@127.0.0.1:55433/phirepass npm test
 */
const PG_TEST_URL = process.env.PG_TEST_URL;

describe('download visibility, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;
    const SCHEMA = 'downloads_scope_test';
    const id: Record<string, string> = {};

    const uuid = async () => (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id as string;

    /** Names of the downloads `shape` sees, sorted. */
    async function seen(shape: DownloadsShape): Promise<string[]> {
        const { sql, params } = downloadsQuery(shape);
        const rows = (await client.query(sql, params)).rows as { job: { name: string } }[];
        return rows.map((row) => row.job.name).sort();
    }

    async function node(label: string, owner: string, org: string | null) {
        id[label] = await uuid();
        await client.query('INSERT INTO nodes (id, user_id, org_id, name) VALUES ($1, $2, $3, $4)', [id[label], owner, org, label]);
    }

    async function download(name: string, nodeLabel: string, wanted = 'running') {
        await client.query(
            `INSERT INTO downloads (id, node_id, wanted, job) VALUES (gen_random_uuid(), $1, $2, $3)`,
            [id[nodeLabel], wanted, { name }],
        );
    }

    async function share(nodeLabel: string, org: string, audience: 'org' | 'user', grantee: string | null, services: string[], revoked = false) {
        await client.query(
            `INSERT INTO node_shares (node_id, org_id, audience, grantee_id, services, revoked_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id[nodeLabel], org, audience, grantee, services, revoked ? new Date() : null],
        );
    }

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);

        // Only the columns the query reads.
        await client.query(`
            CREATE TABLE nodes (id uuid PRIMARY KEY, user_id uuid NOT NULL, org_id uuid, name text);
            CREATE TABLE node_shares (
                node_id uuid NOT NULL, org_id uuid NOT NULL, audience text NOT NULL, grantee_id uuid,
                services text[] NOT NULL DEFAULT '{}', revoked_at timestamptz, expires_at timestamptz);
            CREATE TABLE downloads (
                id uuid PRIMARY KEY, node_id uuid NOT NULL, wanted text NOT NULL, state text NOT NULL DEFAULT 'Queued',
                job jsonb NOT NULL, done_bytes bigint NOT NULL DEFAULT 0, total_bytes bigint,
                down_bps bigint NOT NULL DEFAULT 0, up_bps bigint NOT NULL DEFAULT 0, peers integer NOT NULL DEFAULT 0,
                attempt integer NOT NULL DEFAULT 0, retry_reason text, next_attempt_at timestamptz,
                created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
                finished_at timestamptz);`);

        for (const who of ['orgA', 'orgB', 'admin', 'owner', 'member', 'lentSsh', 'lentFetch', 'lentAll', 'revoked', 'stranger']) {
            id[who] = await uuid();
        }

        await node('A/owner', id.owner, id.orgA);
        await node('A/member', id.member, id.orgA);
        await node('B/stranger', id.stranger, id.orgB);
        await node('unclaimed/owner', id.owner, null);

        await download('a-owner.iso', 'A/owner');
        await download('a-owner-deleted.iso', 'A/owner', 'deleted');
        await download('a-member.mkv', 'A/member');
        await download('b-stranger.zip', 'B/stranger');
        await download('unclaimed.tar', 'unclaimed/owner');

        await share('A/owner', id.orgA, 'user', id.lentSsh, ['SSH']);
        await share('A/owner', id.orgA, 'user', id.lentFetch, [' fetch ']);
        await share('A/owner', id.orgA, 'user', id.lentAll, []);
        await share('A/owner', id.orgA, 'user', id.revoked, ['FETCH'], true);
        // A share row naming another organisation selects nothing.
        await share('B/stranger', id.orgA, 'org', null, []);
    });

    after(async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    const shape = (userId: string, orgId: string | null, managesAll = false): DownloadsShape => ({ userId, orgId, managesAll });

    test("another organisation's downloads are refused, even to its admin", async () => {
        const rows = await seen(shape(id.admin, id.orgA, true));
        assert.ok(!rows.includes('b-stranger.zip'));
        assert.deepEqual(rows, ['a-member.mkv', 'a-owner-deleted.iso', 'a-owner.iso']);
    });

    test('an admin sees every node in the organisation; a member only their own', async () => {
        assert.deepEqual(await seen(shape(id.member, id.orgA)), ['a-member.mkv']);
    });

    test('an owner sees their unclaimed node too, and a row being deleted until the node confirms', async () => {
        assert.deepEqual(await seen(shape(id.owner, id.orgA)), ['a-owner-deleted.iso', 'a-owner.iso', 'unclaimed.tar']);
    });

    test('a share opens downloads only if it opens FETCH', async () => {
        assert.deepEqual(await seen(shape(id.lentSsh, id.orgA)), [], 'SSH only');
        assert.deepEqual(await seen(shape(id.lentFetch, id.orgA)), ['a-owner-deleted.iso', 'a-owner.iso'], 'FETCH, any case');
        assert.deepEqual(await seen(shape(id.lentAll, id.orgA)), ['a-owner-deleted.iso', 'a-owner.iso'], 'empty = every service');
        assert.deepEqual(await seen(shape(id.revoked, id.orgA)), [], 'revoked');
    });

    test('a stranger in the other organisation sees only their own', async () => {
        assert.deepEqual(await seen(shape(id.stranger, id.orgB)), ['b-stranger.zip']);
    });
});
