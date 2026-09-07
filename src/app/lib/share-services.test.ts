import assert from 'node:assert/strict';
import test from 'node:test';

import { unionShareServices } from './share-services.ts';

/**
 * Which services a share opens, as the dashboard reads them.
 *
 * The rule is a copy of `ServiceSet::parse` / `ServiceSet::union` in
 * `phirepass-rs/server/src/access.rs`, and most cases below are named after the
 * Rust test that pins the same thing. That duplication is deliberate — the
 * dashboard decides what to *offer* and the server decides what to *allow* — so
 * a drift between them should fail here, rather than as a session that opens and
 * is refused on its first frame.
 *
 * `null` means "no narrowing".
 */

test('no live share narrows nothing', () => {
    // An unclaimed node the session owns reaches the services route through
    // `nodeScope` and holds no share at all. Reading that as "permits nothing"
    // would hide every service on a machine somebody owns.
    assert.equal(unionShareServices([]), null);
});

test('an empty services array means every service', () => {
    // Not the same as naming none, and the difference is the whole reason this
    // is not a plain array.
    assert.equal(unionShareServices([{ services: [] }]), null);
    assert.equal(unionShareServices([{ services: null }]), null);
});

test('a named service excludes the ones it did not name', () => {
    // The case the column exists for: lend the web service, keep the shell.
    const kinds = unionShareServices([{ services: ['HTTP'] }]);

    assert.ok(kinds);
    assert.ok(kinds.has('HTTP'));
    assert.ok(!kinds.has('SSH'));
    assert.ok(!kinds.has('SFTP'));
    assert.ok(!kinds.has('RDP'));
});

test('two live shares union rather than intersect', () => {
    // An organisation-wide share and one naming this person can both be live.
    // Being named in a second share must never take away what the first gave.
    const kinds = unionShareServices([{ services: ['HTTP'] }, { services: ['SSH'] }]);

    assert.ok(kinds);
    assert.ok(kinds.has('HTTP'));
    assert.ok(kinds.has('SSH'));
    assert.ok(!kinds.has('RDP'));
});

test('one wide share widens the whole answer', () => {
    // The union taken to its conclusion: an org-wide share of everything
    // alongside a narrow personal one leaves the person with everything.
    assert.equal(unionShareServices([{ services: ['HTTP'] }, { services: [] }]), null);
});

test('a service this build does not know costs only itself', () => {
    // `Settings::prune_unknown`'s rule, applied to permissions.
    const kinds = unionShareServices([{ services: ['SSH', 'QUANTUM', 'HTTP'] }]);

    assert.ok(kinds);
    assert.ok(kinds.has('SSH'));
    assert.ok(kinds.has('HTTP'));
    assert.ok(!kinds.has('RDP'));
});

test('a share of only unknown services offers nothing, and is not read as everything', () => {
    // The dangerous misreading: an unparseable permission must not collapse into
    // `null`, which is this function's "no narrowing".
    const kinds = unionShareServices([{ services: ['QUANTUM'] }]);

    assert.notEqual(kinds, null);
    assert.equal(kinds?.size, 0);
});

test('stored names are matched regardless of case or surrounding space', () => {
    // The column holds `ServiceKind` variant names, so a well-formed value is
    // already uppercase — this is tolerance for a row written by hand, not an
    // invitation to write one.
    const kinds = unionShareServices([{ services: [' ssh ', 'Http'] }]);

    assert.ok(kinds);
    assert.ok(kinds.has('SSH'));
    assert.ok(kinds.has('HTTP'));
});
