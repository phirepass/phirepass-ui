import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { GET_ORG_SETTINGS_SQL, SET_ORG_SETTINGS_SQL, readOrgSettings } from './org-download-settings.ts';

/** The upsert, executed by Postgres. Opt-in like the other `*.db.test.ts`. */
const PG_TEST_URL = process.env.PG_TEST_URL;

describe('organisation download settings, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;
    const SCHEMA = 'org_download_settings_test';
    const ORG = '33333333-3333-3333-3333-333333333333';

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);
        await client.query(`CREATE TABLE organization_download_settings (org_id uuid PRIMARY KEY,
            settings jsonb NOT NULL DEFAULT '{}'::jsonb, changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now())`);
    });

    after(async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    test('nothing saved reads as the defaults; a second save replaces the first', async () => {
        const none = await client.query(GET_ORG_SETTINGS_SQL, [ORG]);
        assert.deepEqual(readOrgSettings(none.rows[0]?.settings), { keep_days: 30, stream_link_hours: 6 });

        await client.query(SET_ORG_SETTINGS_SQL, [ORG, JSON.stringify({ keep_days: 7, stream_link_hours: 2 }), null]);
        const second = await client.query(SET_ORG_SETTINGS_SQL, [ORG, JSON.stringify({ keep_days: 90, stream_link_hours: 2 }), null]);
        assert.deepEqual(readOrgSettings(second.rows[0].settings), { keep_days: 90, stream_link_hours: 2 });
        const rows = await client.query('SELECT count(*)::int AS n FROM organization_download_settings');
        assert.equal(rows.rows[0].n, 1);
    });
});
