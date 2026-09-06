import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { buildScope, type ScopeShape } from './scope.ts';

/**
 * The scoping predicate, executed by Postgres.
 *
 * `scope.test.ts` asserts the *shape* of the fragment — which placeholders it
 * claims, which clauses it keeps. This asserts what it actually returns, which
 * is the half a string comparison cannot reach: an `AND`/`OR` precedence
 * mistake produces a fragment that looks right, parses, runs, and hands back
 * somebody else's machines.
 *
 * Opt-in, like the Rust side's Redis tests (`REDIS_TEST_URL`): it needs a real
 * database and must not fail a checkout that has none. Point it at a scratch
 * one — **it creates and drops its own schema** and must never be aimed at
 * anything real:
 *
 *     docker run -d --name pg-test -e POSTGRES_PASSWORD=test \
 *       -e POSTGRES_DB=phirepass -p 55433:5432 postgres:16-alpine
 *     PG_TEST_URL=postgres://postgres:test@127.0.0.1:55433/phirepass npm test
 */
const PG_TEST_URL = process.env.PG_TEST_URL;

describe('org scoping, against Postgres', { skip: PG_TEST_URL ? false : 'set PG_TEST_URL to run' }, () => {
    let client: pg.Client;

    /** Everything is created under this schema so the teardown is one DROP. */
    const SCHEMA = 'scope_test';

    const ids = {
        orgA: '' as string,
        orgB: '' as string,
        owner: '' as string,
        admin: '' as string,
        member: '' as string,
        stranger: '' as string,
    };

    before(async () => {
        client = new pg.Client({ connectionString: PG_TEST_URL });
        await client.connect();

        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);

        // Only the columns the predicate reads. The real table has more, and
        // none of the rest changes the answer.
        await client.query(`
            CREATE TABLE nodes (
                id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id uuid NOT NULL,
                org_id  uuid,
                label   text NOT NULL
            )`);

        const uuid = async () => (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id as string;
        ids.orgA = await uuid();
        ids.orgB = await uuid();
        ids.owner = await uuid();
        ids.admin = await uuid();
        ids.member = await uuid();
        ids.stranger = await uuid();

        await client.query(
            `INSERT INTO nodes (user_id, org_id, label) VALUES
                ($1, $5, 'A/owner'),
                ($2, $5, 'A/admin'),
                ($3, $5, 'A/member'),
                ($4, $6, 'B/stranger'),
                ($3, NULL, 'unclaimed/member'),
                ($4, NULL, 'unclaimed/stranger')`,
            [ids.owner, ids.admin, ids.member, ids.stranger, ids.orgA, ids.orgB],
        );
    });

    after(async () => {
        if (!client) return;
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.end();
    });

    /** The labels this session may see, sorted. */
    async function visible(shape: ScopeShape): Promise<string[]> {
        const scope = buildScope(shape, 'n', { style: 'leading' });
        const result = await client.query(
            `SELECT n.label FROM ${SCHEMA}.nodes n WHERE ${scope.sql} ORDER BY n.label`,
            scope.params,
        );
        return result.rows.map((row) => row.label as string);
    }

    test('an admin of org A sees every node in org A, and nothing outside it', async () => {
        assert.deepEqual(
            await visible({ orgId: ids.orgA, userId: ids.admin, readsAll: true }),
            ['A/admin', 'A/member', 'A/owner'],
        );
    });

    test('a member of org A sees only their own', async () => {
        assert.deepEqual(
            await visible({ orgId: ids.orgA, userId: ids.member, readsAll: false }),
            ['A/member', 'unclaimed/member'],
        );
    });

    /**
     * The clause an `AND`/`OR` precedence slip breaks first, and the one that
     * matters most: an organisation is a boundary, not a label. Being an owner
     * somewhere is not being an owner everywhere.
     */
    test('an owner of org B sees nothing belonging to org A', async () => {
        // Their own org, plus the unclaimed node they personally own — which is
        // the other clause, and correct. Nothing of org A's appears.
        assert.deepEqual(
            await visible({ orgId: ids.orgB, userId: ids.stranger, readsAll: true }),
            ['B/stranger', 'unclaimed/stranger'],
        );
    });

    test('an unclaimed node is visible to its owner and to no one else', async () => {
        // Its owner sees it even as a plain member...
        assert.ok((await visible({ orgId: ids.orgA, userId: ids.member, readsAll: false }))
            .includes('unclaimed/member'));

        // ...and an admin of the organisation they are in does not, because the
        // node is not in any organisation to be an admin of.
        assert.ok(!(await visible({ orgId: ids.orgA, userId: ids.admin, readsAll: true }))
            .includes('unclaimed/member'));
    });

    test('a session in no organisation still reaches its own unclaimed nodes', async () => {
        // `orgId` can never actually be null in a Session, but the row's can, and
        // an org id that matches nothing is the same test from the other side.
        const nobody = await client.query('SELECT gen_random_uuid() AS id');
        assert.deepEqual(
            await visible({ orgId: nobody.rows[0].id, userId: ids.stranger, readsAll: false }),
            ['unclaimed/stranger'],
        );
    });

    test('the appended form selects the same rows as the leading form', async () => {
        // Two ways of numbering the same predicate. They are used in different
        // queries and have to agree, or a monitor list and a node list disagree
        // about what exists.
        const shape: ScopeShape = { orgId: ids.orgA, userId: ids.member, readsAll: false };

        const appended = buildScope(shape, 'n', { style: 'appended', used: 1 });
        const result = await client.query(
            `SELECT n.label FROM ${SCHEMA}.nodes n WHERE ${appended.sql} ORDER BY n.label`,
            [shape.userId, ...appended.params],
        );

        assert.deepEqual(result.rows.map((row) => row.label), await visible(shape));
    });

    test('the predicate composes after a caller parameter without renumbering wrong', async () => {
        // What `scopeAt` does in the single-row routes: the caller's own `$1`
        // first, the scope shifted past it.
        const shape: ScopeShape = { orgId: ids.orgA, userId: ids.admin, readsAll: true };
        const scope = buildScope(shape, 'n', { style: 'leading' });
        const shifted = scope.sql.replace(/\$(\d+)/g, (_, d: string) => `$${Number(d) + 1}`);

        const result = await client.query(
            `SELECT n.label FROM ${SCHEMA}.nodes n WHERE n.label = $1 AND ${shifted}`,
            ['A/member', ...scope.params],
        );

        assert.deepEqual(result.rows.map((row) => row.label), ['A/member']);
    });
});
