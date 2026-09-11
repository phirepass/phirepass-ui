import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { clearSessionToken, loadSessionToken } from './use-session-token.ts';

/**
 * Fetching the websocket token, which is the thing that stopped working.
 *
 * The request used to live inside the effect that wanted it, with `loading` in
 * the dependency array and an `alive` flag gating the result — so the effect
 * body's own `setLoading(true)` re-ran the effect, the cleanup set `alive` to
 * false on the request it had just started, and the response was discarded. The
 * panel said "Loading session token…" for ever and no widget ever mounted.
 *
 * The fix was to move the request out of React entirely, so these are tests
 * about a module rather than about a component: one request no matter how many
 * panels ask, the answer kept, and a failure *not* kept. A component lifecycle
 * cannot lose any of that, which is the property that matters.
 */

let calls = 0;
let respond: () => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    calls = 0;
    clearSessionToken();
    respond = () => Promise.resolve(jsonResponse({ token: 'jwt-1' }));
    globalThis.fetch = (() => {
        calls += 1;
        return respond();
    }) as typeof fetch;
});

test('the token is fetched once and handed to everyone who asks', async () => {
    const [a, b] = await Promise.all([loadSessionToken(), loadSessionToken()]);

    assert.equal(a, 'jwt-1');
    assert.equal(b, 'jwt-1');
    assert.equal(calls, 1, 'two panels opening in the same tick are one request');
});

/**
 * The mount/unmount/mount React does in development, as the module sees it.
 * The second caller joins the request the first one started; nothing cancels it.
 */
test('asking again while the first request is in flight joins it', async () => {
    const first = loadSessionToken();
    const second = loadSessionToken();

    assert.equal(await first, 'jwt-1');
    assert.equal(await second, 'jwt-1');
    assert.equal(calls, 1);
});

test('a token already fetched is answered without a request', async () => {
    await loadSessionToken();
    assert.equal(calls, 1);

    assert.equal(await loadSessionToken(), 'jwt-1');
    assert.equal(calls, 1, 'the token authenticates the account, not the session');
});

test('a refused request is an error, not a token', async () => {
    respond = () => Promise.resolve(jsonResponse({ error: 'nope' }, 401));

    await assert.rejects(loadSessionToken(), /401/);
});

test('a response without a token is an error too', async () => {
    respond = () => Promise.resolve(jsonResponse({}));

    await assert.rejects(loadSessionToken(), /missing token/);
});

/**
 * The half that makes Retry work, and the reason a rejection is never cached:
 * a failure from a minute ago must not be the answer to a question asked now.
 */
test('a failure is not remembered, so the next ask really asks', async () => {
    respond = () => Promise.resolve(jsonResponse({ error: 'nope' }, 503));
    await assert.rejects(loadSessionToken());
    assert.equal(calls, 1);

    respond = () => Promise.resolve(jsonResponse({ token: 'jwt-2' }));
    assert.equal(await loadSessionToken(), 'jwt-2');
    assert.equal(calls, 2);
});

test('signing out drops the token, so the next account gets its own', async () => {
    assert.equal(await loadSessionToken(), 'jwt-1');

    clearSessionToken();
    respond = () => Promise.resolve(jsonResponse({ token: 'jwt-2' }));

    assert.equal(await loadSessionToken(), 'jwt-2');
    assert.equal(calls, 2);
});
