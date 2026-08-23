import assert from 'node:assert/strict';
import { test } from 'node:test';

import { subscribedWithKey } from './push.ts';

/** The public half of a real VAPID pair, as the dashboard publishes it. */
const KEY = 'BOisk9mByAFe8xO-hCjoxEPv39GyP9G8y_WO_j8vcJfbxa3kVdVs49v0FVw3SSeuDWTqSzlNSwXRSqeAA3d7WRM';
/** An unrelated pair's public half — the same shape, a different key. */
const OTHER = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUAtHRkYNiPV3IUiCcc';

function bytes(base64Url: string): ArrayBuffer {
    const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out.buffer;
}

test('a subscription made under the current key is kept', () => {
    assert.equal(subscribedWithKey(bytes(KEY), KEY), true);
});

/**
 * The failure this exists for. A subscription bound to an older key is refused
 * by the push service with `403 invalid JWT provided` for the rest of its life,
 * and that refusal is deliberately not treated as evidence the subscription is
 * dead — so reusing it registers an endpoint nothing will ever reach.
 */
test('a subscription made under a different key is replaced', () => {
    assert.equal(subscribedWithKey(bytes(OTHER), KEY), false);
});

/** Nothing to sign for: it cannot be pushed to under any VAPID key. */
test('a subscription carrying no application server key is replaced', () => {
    assert.equal(subscribedWithKey(null, KEY), false);
});

/**
 * A browser too old to expose `options` tells us nothing, and churning a
 * subscription that may well be fine is worse than leaving it alone.
 */
test('a browser that does not expose the key leaves the subscription alone', () => {
    assert.equal(subscribedWithKey(undefined, KEY), true);
});

/** A truncated or padded value is a different key, not a spelling of this one. */
test('a key of the wrong length does not match', () => {
    assert.equal(subscribedWithKey(bytes(KEY).slice(0, 64), KEY), false);
});
