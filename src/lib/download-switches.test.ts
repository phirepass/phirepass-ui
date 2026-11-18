import assert from 'node:assert/strict';
import test from 'node:test';

import { applySteps, confirmationFor, policyLock, runningLabel, switchState, switchSteps } from './download-switches.ts';

const OFF = { downloads: false, torrents: false };
const LINKS = { downloads: true, torrents: false };
const ALL = { downloads: true, torrents: true };

test('the switches are read from the service counts', () => {
    assert.deepEqual(switchState(undefined), OFF);
    assert.deepEqual(switchState({ SSH: 2, FETCH: 1 }), LINKS);
    assert.deepEqual(switchState({ FETCH: 1, TORRENT: 1 }), ALL);
    assert.deepEqual(switchState({ FETCH: 0 }), OFF);
});

test('turning downloads on creates one FETCH service', () => {
    assert.deepEqual(switchSteps(OFF, 'FETCH', true), [{ op: 'create', kind: 'FETCH' }]);
    assert.deepEqual(switchSteps(LINKS, 'FETCH', true), [], 'already on');
});

test('turning downloads off removes torrents first', () => {
    // The node refuses removing FETCH while TORRENT exists.
    assert.deepEqual(switchSteps(ALL, 'FETCH', false), [
        { op: 'remove', kind: 'TORRENT' },
        { op: 'remove', kind: 'FETCH' },
    ]);
    assert.deepEqual(switchSteps(LINKS, 'FETCH', false), [{ op: 'remove', kind: 'FETCH' }]);
    assert.deepEqual(applySteps(ALL, switchSteps(ALL, 'FETCH', false)), OFF);
});

test('torrents need downloads', () => {
    assert.throws(() => switchSteps(OFF, 'TORRENT', true), /Downloads on before Torrents/);
    assert.deepEqual(switchSteps(LINKS, 'TORRENT', true), [{ op: 'create', kind: 'TORRENT' }]);
    assert.deepEqual(switchSteps(ALL, 'TORRENT', false), [{ op: 'remove', kind: 'TORRENT' }]);
    assert.deepEqual(applySteps(LINKS, switchSteps(LINKS, 'TORRENT', true)), ALL);
});

test('K7 is asked every time torrents go on, and never when they go off', () => {
    assert.equal(confirmationFor(LINKS, 'TORRENT', true, 0), 'K7');
    assert.equal(confirmationFor(ALL, 'TORRENT', false, 3), null);
});

test('K6 is asked only when downloads go off with something running', () => {
    assert.equal(confirmationFor(LINKS, 'FETCH', false, 2), 'K6');
    assert.equal(confirmationFor(LINKS, 'FETCH', false, 0), null, 'nothing running flips silently');
    assert.equal(confirmationFor(OFF, 'FETCH', true, 0), null);
});

test('the running count reads as a sentence', () => {
    assert.equal(runningLabel(1), '1 download running');
    assert.equal(runningLabel(2), '2 downloads running');
});

test('a blocked node locks both switches and says who can change it', () => {
    assert.equal(policyLock('blocked', 'FETCH', 'acme'), 'Blocked by your organisation. Ask an owner or admin of acme.');
    assert.equal(policyLock('blocked', 'TORRENT', 'acme'), 'Needs Downloads.');
});

test('links only locks Torrents alone, and allowed or unknown locks nothing', () => {
    assert.equal(policyLock('links_only', 'FETCH', 'acme'), null);
    assert.match(policyLock('links_only', 'TORRENT', 'acme') ?? '', /only links/);
    assert.equal(policyLock('allowed', 'TORRENT', 'acme'), null);
    assert.equal(policyLock(undefined, 'FETCH', 'acme'), null);
});
