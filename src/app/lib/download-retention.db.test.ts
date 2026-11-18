import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { RETENTION_SQL } from './download-retention.ts';

/**
 * The retention statement, executed by Postgres. Opt-in like the other
 * `*.db.test.ts`; it creates and drops its own schema.
 */
const PG_TEST_URL = process.env.PG_TEST_URL;

describe('download retention, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;
    const SCHEMA = 'download_retention_test';

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);
        await client.query(`CREATE TABLE downloads (name text PRIMARY KEY, state text NOT NULL,
            wanted text NOT NULL DEFAULT 'running', finished_at timestamptz, org_id uuid)`);
        await client.query(`CREATE TABLE organization_download_settings (org_id uuid PRIMARY KEY,
            settings jsonb NOT NULL DEFAULT '{}'::jsonb)`);
    });

    after(async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    test('a 31-day-old finished row goes; running, seeding, recent and to-be-deleted rows stay', async () => {
        await client.query(`INSERT INTO downloads (name, state, wanted, finished_at) VALUES
            ('old-completed', 'Completed', 'running', now() - interval '31 days'),
            ('old-cancelled', 'Cancelled', 'stopped', now() - interval '40 days'),
            ('recent',        'Completed', 'running', now() - interval '29 days'),
            ('seeding',       'Seeding',   'running', now() - interval '90 days'),
            ('running',       'Downloading', 'running', NULL),
            ('paused',        'Paused',    'running', NULL),
            ('awaiting-node', 'Completed', 'deleted', now() - interval '60 days')`);
        const result = await client.query(RETENTION_SQL);
        assert.equal(result.rowCount, 2);
        const left = (await client.query('SELECT name FROM downloads ORDER BY name')).rows.map((r) => r.name);
        assert.deepEqual(left, ['awaiting-node', 'paused', 'recent', 'running', 'seeding']);
    });

    test("an organisation's own keep_days decides, and an empty row means 30", async () => {
        await client.query('DELETE FROM downloads');
        const short = '11111111-1111-1111-1111-111111111111';
        const empty = '22222222-2222-2222-2222-222222222222';
        await client.query(`INSERT INTO organization_download_settings (org_id, settings) VALUES
            ('${short}', '{"keep_days": 7}'), ('${empty}', '{}')`);
        await client.query(`INSERT INTO downloads (name, state, finished_at, org_id) VALUES
            ('short-10-days', 'Completed', now() - interval '10 days', '${short}'),
            ('short-5-days',  'Completed', now() - interval '5 days',  '${short}'),
            ('empty-10-days', 'Completed', now() - interval '10 days', '${empty}')`);
        await client.query(RETENTION_SQL);
        const left = (await client.query('SELECT name FROM downloads ORDER BY name')).rows.map((r) => r.name);
        assert.deepEqual(left, ['empty-10-days', 'short-5-days']);
    });
});
