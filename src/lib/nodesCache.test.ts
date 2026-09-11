import assert from 'node:assert/strict';
import test from 'node:test';

import { selectCachedNodes, type NodesCacheEnvelope } from './nodesCache.ts';
import type { TunnelNode } from '@/types/node';

/**
 * Which cached nodes may be shown, and to whom.
 *
 * The cache used to be a bare array under one key with nothing in it to say
 * whose nodes they were, and switching workspace is a full page load whose first
 * paint comes from here — so the machines of the workspace you had just left,
 * including ones shared with you *there*, reappeared under the one you had moved
 * to. This is the rule that stops that, pinned on its own because a cache that
 * answers with the wrong tenant's rows fails silently.
 */

const node = { id: 'node-1', name: 'rpi-2' } as unknown as TunnelNode;

function envelope(over: Partial<NodesCacheEnvelope> = {}): NodesCacheEnvelope {
    return { orgId: 'org-a', nodes: [node], ...over };
}

test('nodes come back for the organisation that wrote them', () => {
    assert.deepEqual(selectCachedNodes(envelope(), 'org-a'), [node]);
});

test('another workspace is a cache miss, not a filtered list', () => {
    assert.equal(selectCachedNodes(envelope(), 'org-b'), null);
});

/**
 * The profile has not answered on the first render of every page, so this is the
 * common case rather than an edge one: the envelope is trusted for that one
 * paint, and the page drops it as soon as the organisation resolves to another.
 */
test('an unknown organisation accepts the envelope, so the instant paint survives', () => {
    assert.deepEqual(selectCachedNodes(envelope(), null), [node]);
});

test('an envelope that names no organisation is never shown', () => {
    assert.equal(selectCachedNodes(envelope({ orgId: null }), 'org-a'), null);
    assert.equal(selectCachedNodes(envelope({ orgId: null }), null), null);
});

test('nothing cached is nothing shown', () => {
    assert.equal(selectCachedNodes(null, 'org-a'), null);
});
