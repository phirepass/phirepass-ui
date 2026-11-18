import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { playbackPositions } from './migrations/009-playback-positions.ts';
import { CLEAR_SQL, GET_SQL, SAVE_SQL } from './playback.ts';

/**
 * `/api/playback`'s statements, executed by Postgres. Opt-in like the other
 * `*.db.test.ts`; it creates and drops its own schema.
 */
const PG_TEST_URL = process.env.PG_TEST_URL;

describe('playback positions, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;
    const SCHEMA = 'playback_positions_test';
    const alice = '11111111-1111-1111-1111-111111111111';
    const bob = '22222222-2222-2222-2222-222222222222';
    const key = 'dl:33333333-3333-3333-3333-333333333333:0';

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);
        await client.query(`CREATE TABLE users (id uuid PRIMARY KEY)`);
        await client.query(`INSERT INTO users VALUES ('${alice}'), ('${bob}')`);
        await client.query(playbackPositions.sql);
        await client.query(playbackPositions.sql); // re-runnable
    });

    after(async () => {
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    test("one person cannot read or clear another's position", async () => {
        await client.query(SAVE_SQL, [alice, key, 760, 3600]);
        assert.equal((await client.query(GET_SQL, [bob, key])).rowCount, 0);
        await client.query(CLEAR_SQL, [bob, key]);
        const mine = (await client.query(GET_SQL, [alice, key])).rows[0];
        assert.equal(mine.secs, 760);
        assert.equal(mine.duration, 3600);
        assert.ok(Math.abs(mine.at - Date.now()) < 60_000, 'at is unix ms');
    });

    test('saving again replaces, clearing removes', async () => {
        await client.query(SAVE_SQL, [alice, key, 900, 3600]);
        assert.equal((await client.query(GET_SQL, [alice, key])).rows[0].secs, 900);
        await client.query(CLEAR_SQL, [alice, key]);
        assert.equal((await client.query(GET_SQL, [alice, key])).rowCount, 0);
    });
});
