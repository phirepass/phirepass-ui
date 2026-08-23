import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeDelivery, MAX_AGE_SECONDS, type CandidateSecret } from './webhook-receiver.ts';
import { signBody } from './webhook-signature.ts';

const NOW = 1_700_000_000;
const BODY = '{"id":"abc","event":"node.offline","kind":"webhook","sent_at":"2026-08-23T18:00:00Z","payload":{}}';

const registered: CandidateSecret[] = [
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', label: 'self test', secret: 'a-secret-of-adequate-length' },
];

function headersFor(secret: string, timestamp = NOW) {
    return {
        signature: `sha256=${signBody(secret, String(timestamp), BODY)}`,
        timestamp: String(timestamp),
        event: 'node.offline',
        delivery: 'abc',
    };
}

test('a delivery signed with the registered secret verifies', () => {
    const verdict = judgeDelivery(headersFor(registered[0].secret), BODY, registered, NOW);

    assert.equal(verdict.ok, true);
    assert.equal(verdict.status, 200);
    assert.deepEqual(verdict.matched, { id: registered[0].id, label: 'self test' });
});

/**
 * The whole reason this endpoint exists is to prove the signature is right, so
 * a receiver that answers 200 to anything would test nothing — and the
 * dashboard's endpoint list would show a green row over a broken chain.
 */
test('a delivery signed with a different secret is refused', () => {
    const verdict = judgeDelivery(headersFor('some-other-secret-entirely'), BODY, registered, NOW);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 401);
    assert.equal(verdict.matched, null);
});

/** The body is signed, so a byte changed in flight has to fail. */
test('a body altered after signing is refused', () => {
    const verdict = judgeDelivery(headersFor(registered[0].secret), `${BODY} `, registered, NOW);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 401);
});

/**
 * The timestamp is inside the signed material, so this is what stops a captured
 * delivery being replayed later — the header cannot be refreshed without
 * invalidating the signature, and an old one is refused outright.
 */
test('a delivery outside the age window is refused', () => {
    const stale = NOW - MAX_AGE_SECONDS - 1;
    const verdict = judgeDelivery(headersFor(registered[0].secret, stale), BODY, registered, NOW);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 400);
    assert.match(verdict.reason, /window/);
});

/** Either clock can be the fast one — this deployment has already met that. */
test('a delivery from a clock running ahead is refused the same way', () => {
    const ahead = NOW + MAX_AGE_SECONDS + 1;
    const verdict = judgeDelivery(headersFor(registered[0].secret, ahead), BODY, registered, NOW);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 400);
});

test('a delivery with no signature headers is a bad request, not an auth failure', () => {
    const verdict = judgeDelivery(
        { signature: null, timestamp: null, event: null, delivery: null },
        BODY,
        registered,
        NOW,
    );

    assert.equal(verdict.status, 400);
});

/**
 * Distinct from a bad signature: nothing points here, so there is no secret to
 * check against. Saying so is the difference between "your signing is wrong"
 * and "you have not registered this URL yet".
 */
test('a delivery with nothing registered against this URL says so', () => {
    const verdict = judgeDelivery(headersFor(registered[0].secret), BODY, [], NOW);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 401);
    assert.match(verdict.reason, /no enabled webhook endpoint is registered/);
});

/**
 * The courier signs in Rust and this verifies in Node. The vector is the one
 * pinned in `courier/src/delivery/webhook.rs`, so a change to either side that
 * breaks the other fails here rather than in production.
 */
test('the courier\'s pinned signature verifies under this receiver', () => {
    const secret = 'a-secret-of-adequate-length';
    const body = '{"event":"node.offline","id":"abc"}';
    const timestamp = '1700000000';

    assert.equal(
        signBody(secret, timestamp, body),
        'fb14f0fb3f3d2d21a914f52764c4a7ea94dbb039a8d697bda0fd97ab7db913fa',
    );

    const verdict = judgeDelivery(
        { signature: `sha256=fb14f0fb3f3d2d21a914f52764c4a7ea94dbb039a8d697bda0fd97ab7db913fa`, timestamp, event: 'node.offline', delivery: 'abc' },
        body,
        [{ id: 'x', label: null, secret }],
        Number(timestamp),
    );

    assert.equal(verdict.ok, true);
});
