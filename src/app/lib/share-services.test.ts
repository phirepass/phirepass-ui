import assert from 'node:assert/strict';
import test from 'node:test';

import { narrowShareServices, unionShareServices, type ShareableService } from './share-services.ts';

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

/**
 * What a shared node offers on its card.
 *
 * The other half of the rule above, and the reason the picker used to open
 * empty: the node list published every service the machine ran while the picker
 * published only what the share opened, so a node lent for one service showed
 * four tiles and three of them led to a blank dialog. These are the cases where
 * the two now have to agree.
 */

test('a share that named nothing opens every service', () => {
    const counts = { SSH: 1, SFTP: 1, HTTP: 2 };

    assert.deepEqual(narrowShareServices(counts, null), counts);
});

test('a share that named one service offers only that one', () => {
    const permitted = new Set<ShareableService>(['SFTP']);

    assert.deepEqual(
        narrowShareServices({ SSH: 1, SFTP: 1, HTTP: 2 }, permitted),
        { SFTP: 1 },
    );
});

test('a service the node does not run is not invented by naming it', () => {
    const permitted = new Set<ShareableService>(['SSH', 'RDP']);

    assert.deepEqual(narrowShareServices({ SSH: 2 }, permitted), { SSH: 2 });
});

/**
 * A share whose every named service is one this build does not recognise
 * permits nothing — see `unionShareServices`. It must therefore offer nothing,
 * rather than falling back to everything.
 */
test('a share that permits nothing offers nothing', () => {
    assert.deepEqual(
        narrowShareServices({ SSH: 1, HTTP: 1 }, new Set<ShareableService>()),
        {},
    );
});

test('narrowing never mutates the counts it was given', () => {
    const counts = { SSH: 1, SFTP: 1 };
    narrowShareServices(counts, new Set<ShareableService>(['SSH']));

    assert.deepEqual(counts, { SSH: 1, SFTP: 1 });
});

/** The two halves, run together the way the route runs them. */
test('two live shares union before they narrow', () => {
    const permitted = unionShareServices([
        { services: ['SSH'] },
        { services: ['SFTP'] },
    ]);

    assert.deepEqual(
        narrowShareServices({ SSH: 1, SFTP: 1, RDP: 1 }, permitted),
        { SSH: 1, SFTP: 1 },
    );
});
