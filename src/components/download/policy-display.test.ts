import assert from 'node:assert/strict';
import test from 'node:test';

import { describePolicyRow, needsConfirmation, type PolicyRow } from './policy-display.ts';

const ME = 'u-me';
const row = (over: Partial<PolicyRow>): PolicyRow => ({
    id: 'n1', name: 'raspberrypi', owner_id: ME, owner_username: null, owner_email: 'me@example.org',
    policy: 'allowed', changed_at: null, changed_by: null, changed_by_username: null, changed_by_email: null,
    downloads_on: true, running: 0, ...over,
});

test('an allowed node names its owner and what runs', () => {
    assert.equal(describePolicyRow(row({ running: 2 }), ME), 'owner: you · 2 running');
    assert.equal(describePolicyRow(row({ owner_id: 'u-b', owner_username: 'bo' }), ME), 'owner: bo');
    assert.equal(describePolicyRow(row({ owner_id: 'u-c', owner_email: null }), ME), 'owner: a teammate');
});

test('a restricted node says who restricted it and when', () => {
    const blocked = row({ policy: 'blocked', changed_by: ME, changed_at: '2026-11-14T10:00:00Z', downloads_on: false });
    assert.equal(describePolicyRow(blocked, ME), 'blocked by you on 14 Nov');
});

test('a node with Downloads off says so, unless it is blocked anyway', () => {
    assert.equal(describePolicyRow(row({ owner_id: 'u-b', owner_username: 'bo', downloads_on: false }), ME),
        'owner: bo · Downloads switched off on the node');
});

test('tightening with downloads running asks first; loosening never does', () => {
    assert.ok(needsConfirmation(row({ running: 1 }), 'blocked'));
    assert.ok(needsConfirmation(row({ running: 1 }), 'links_only'));
    assert.ok(!needsConfirmation(row({ running: 0 }), 'blocked'));
    assert.ok(!needsConfirmation(row({ running: 3, policy: 'blocked' }), 'allowed'));
});
