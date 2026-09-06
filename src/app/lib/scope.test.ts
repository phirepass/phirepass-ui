import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildScope, renumber, type ScopeShape } from './scope.ts';

/**
 * The predicate every org-scoped query in this app is built from.
 *
 * These tests are about the *shape* — placeholder numbering, and which of the
 * three clauses appear — because that is where a mistake is silent: a fragment
 * that renumbers wrongly still runs, still returns rows, and returns the wrong
 * ones. The rules about who holds which permission live in `rbac.test.ts`.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function shape(readsAll: boolean): ScopeShape {
    return { orgId: ORG, userId: USER, readsAll };
}

test('a leading scope numbers itself $1 $2 $3 and takes those three values', () => {
    const scope = buildScope(shape(true), 'n', { style: 'leading' });

    assert.match(scope.sql, /\$1/);
    assert.match(scope.sql, /\$2::boolean/);
    assert.match(scope.sql, /\$3/);
    assert.deepEqual(scope.params, [ORG, true, USER]);
});

test('an appended scope reuses $1 as the user and puts its own values last', () => {
    // The caller already passes their user id as $1 and has, say, four
    // parameters. The scope must land on $5 and $6 and touch nothing before it.
    const scope = buildScope(shape(false), 'm', { style: 'appended', used: 4 });

    assert.match(scope.sql, /\$5/, 'org should be $5');
    assert.match(scope.sql, /\$6::boolean/, 'the permission flag should be $6');
    assert.match(scope.sql, /m\.user_id = \$1/, 'the user should stay $1');
    assert.deepEqual(scope.params, [ORG, false]);

    // Nothing in between may be claimed by the fragment.
    for (const taken of ['$2', '$3', '$4']) {
        assert.ok(!scope.sql.includes(taken), `fragment must not use ${taken}`);
    }
});

test('renumber shifts every placeholder and nothing else', () => {
    const before = '(a.org_id = $1 OR (a.org_id IS NULL AND a.user_id = $3)) AND ($2::boolean OR a.user_id = $3)';
    const after = renumber(before, 2);

    assert.equal(
        after,
        '(a.org_id = $3 OR (a.org_id IS NULL AND a.user_id = $5)) AND ($4::boolean OR a.user_id = $5)',
    );
});

test('renumbering past nine does not corrupt two-digit placeholders', () => {
    // The bug this guards: a naive single-digit regex turns $1 into $10 and then
    // reads the trailing 0 as part of the next token.
    assert.equal(renumber('$1 $2 $9 $10 $11', 5), '$6 $7 $14 $15 $16');
});

test('the alias prefixes every column, and an empty alias prefixes none', () => {
    const aliased = buildScope(shape(true), 'nodes', { style: 'leading' });
    assert.ok(aliased.sql.includes('nodes.org_id'));
    assert.ok(aliased.sql.includes('nodes.user_id'));

    const bare = buildScope(shape(true), '', { style: 'leading' });
    assert.ok(bare.sql.includes('org_id'));
    assert.ok(!bare.sql.includes('.org_id'));
});

test('the unclaimed-row arm is present, and is owner-only', () => {
    // A row the org backfill has not reached (`org_id IS NULL`) must be visible
    // to whoever enrolled it and to nobody else — the behaviour that existed
    // before organisations. Losing this arm hides those rows from their owner;
    // widening it leaks them to the whole workspace.
    const scope = buildScope(shape(true), 'n', { style: 'leading' });
    assert.match(scope.sql, /n\.org_id IS NULL AND n\.user_id = \$3/);
});

test('the permission flag is cast, so composing the fragment cannot make it ambiguous', () => {
    for (const style of [
        buildScope(shape(true), 'n', { style: 'leading' }),
        buildScope(shape(true), 'n', { style: 'appended', used: 3 }),
    ]) {
        assert.match(style.sql, /::boolean/);
    }
});

test('a reader without the :all permission still matches their own rows', () => {
    // Not a SQL execution test — it asserts the fragment keeps both arms, which
    // is what makes "false" mean "mine only" rather than "nothing".
    const scope = buildScope(shape(false), 'n', { style: 'leading' });
    assert.deepEqual(scope.params, [ORG, false, USER]);
    assert.match(scope.sql, /\$2::boolean OR n\.user_id = \$3/);
});

// ─────────────────────────────────────────────────────────────────────────────
// The share arm
// ─────────────────────────────────────────────────────────────────────────────
//
// Shape again, not semantics: the arm adds no parameters, so the risk it
// carries is that it reuses the *wrong* placeholder — pointing the organisation
// check at the permission flag, say — which still runs and still returns rows.

test('no share arm unless a caller names the column the node id lives in', () => {
    const scope = buildScope(shape(false), 'n', { style: 'leading' });

    assert.doesNotMatch(scope.sql, /node_shares/, 'shares are opt-in per scope');
});

test('a leading share arm reuses $1 for the org and $3 for the caller', () => {
    const scope = buildScope(shape(false), 'n', { style: 'leading' }, 'id');

    assert.match(scope.sql, /s\.node_id = n\.id/);
    assert.match(scope.sql, /s\.org_id = \$1/, 'the org must be the same $1 as the first clause');
    assert.match(scope.sql, /s\.grantee_id = \$3/, 'the grantee must be the caller');
    assert.match(scope.sql, /s\.revoked_at IS NULL/, 'revocation is evaluated on every read');
    assert.match(scope.sql, /s\.audience = 'org'/);

    // The whole point of reusing placeholders: the caller's numbering is
    // untouched, so adding sharing did not renumber a single existing query.
    assert.deepEqual(scope.params, [ORG, false, USER]);
});

test('an appended share arm follows the caller parameters, still adding none', () => {
    const scope = buildScope(shape(false), 'm', { style: 'appended', used: 4 }, 'node_id');

    assert.match(scope.sql, /s\.node_id = m\.node_id/, 'a monitor is shared through its node');
    assert.match(scope.sql, /s\.org_id = \$5/, 'the org is the appended $5, not $1');
    assert.match(scope.sql, /s\.grantee_id = \$1/, 'the caller is still $1 in appended style');
    assert.deepEqual(scope.params, [ORG, false]);
});

test('the share arm sits inside the second clause, never the first', () => {
    // If it escaped to the first clause it would widen which *organisation* is
    // readable, rather than who inside one may read a row. The org equality has
    // to be the thing the arm is ANDed under.
    const scope = buildScope(shape(false), 'n', { style: 'leading' }, 'id');

    const firstClause = scope.sql.slice(0, scope.sql.indexOf('AND ($2::boolean'));
    assert.doesNotMatch(firstClause, /node_shares/);
});

test('reading everything in the org does not depend on the share arm', () => {
    // An owner or admin already passes the second clause on $2, so the arm is
    // additive rather than load bearing for them.
    const scope = buildScope(shape(true), 'n', { style: 'leading' }, 'id');

    assert.match(scope.sql, /\$2::boolean OR/);
    assert.equal(scope.params[1], true);
});
