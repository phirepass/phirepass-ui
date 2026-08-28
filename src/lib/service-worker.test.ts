import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { forgetSubscription, rememberSubscription } from './push.ts';

/**
 * These drive the shipped `public/sw.js`, not a copy of its logic.
 *
 * The worker is served raw, outside the bundle, so it can neither import from
 * `src/` nor be imported by it — which is exactly why its contract with the page
 * is the thing worth testing. Evaluating the real file with a fake `self` is the
 * only way to assert the two halves agree: several tests below write the hint
 * through `rememberSubscription` and then let the worker find it, so a rename of
 * the cache on either side fails here rather than in production, where it would
 * show up as nothing at all going wrong and notifications quietly stopping.
 */
const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

/** The public half of a real VAPID pair, as the dashboard publishes it. */
const KEY = 'BOisk9mByAFe8xO-hCjoxEPv39GyP9G8y_WO_j8vcJfbxa3kVdVs49v0FVw3SSeuDWTqSzlNSwXRSqeAA3d7WRM';
/** An unrelated pair's public half — the same shape, a different key. */
const OTHER = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUAtHRkYNiPV3IUiCcc';

function bytes(base64Url: string): Uint8Array {
    const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
}

/*
 * The fakes below stand in for browser globals the worker reaches through — the
 * Cache API, `self.registration`, a push subscription — and none of them has a
 * lib.dom type worth reproducing here for the two or three members each test
 * touches. `any` is the point: this file asserts what the worker *does* with
 * them, not that they are complete.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Enough of the Cache API for the one blob the two halves exchange. */
function makeCaches() {
    const stores = new Map<string, Map<string, Response>>();
    return {
        async open(name: string) {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name)!;
            return {
                async match(url: string) { return store.get(url); },
                async put(url: string, response: Response) { store.set(url, response); },
                async delete(url: string) { return store.delete(url); },
                async addAll() { /* install path, unused here */ },
            };
        },
        async keys() { return [...stores.keys()]; },
        async delete(name: string) { return stores.delete(name); },
        async match() { return undefined; },
    };
}

function makeSubscription(endpoint: string) {
    return {
        endpoint,
        unsubscribed: 0,
        toJSON() {
            return { endpoint, keys: { p256dh: `p256dh-for-${endpoint}`, auth: `auth-for-${endpoint}` } };
        },
        async unsubscribe() { this.unsubscribed += 1; return true; },
    };
}

interface WorkerOptions {
    caches?: any;
    /** What `/api/config` answers, or `null` for a request that fails outright. */
    config?: Record<string, string> | null;
    /** Status the device-registration route answers with. */
    registerStatus?: number;
    /** Makes `pushManager.subscribe` reject, as a browser out of quota would. */
    subscribeThrows?: boolean;
}

function loadWorker(options: WorkerOptions = {}) {
    const listeners = new Map<string, (event: any) => void>();
    const subscribeCalls: any[] = [];
    const posted: any[] = [];
    const requested: string[] = [];
    const created = makeSubscription('https://push.example/renewed');

    const self: any = {
        addEventListener(type: string, handler: (event: any) => void) {
            listeners.set(type, handler);
        },
        registration: {
            pushManager: {
                async subscribe(opts: any) {
                    subscribeCalls.push(opts);
                    if (options.subscribeThrows) throw new Error('push service refused');
                    return created;
                },
            },
            async showNotification() { /* unused here */ },
        },
        clients: { async matchAll() { return []; }, async openWindow() {}, async claim() {} },
        location: { origin: 'https://phirepass.com' },
        skipWaiting() {},
    };

    const fetchImpl = async (url: string, init?: any) => {
        requested.push(url);

        if (url === '/api/config') {
            if (options.config === null || options.config === undefined) {
                throw new Error('offline');
            }
            return new Response(JSON.stringify(options.config), { status: 200 });
        }

        if (url === '/api/notifications/devices') {
            posted.push(JSON.parse(init.body));
            const status = options.registerStatus ?? 201;
            return new Response('{}', { status });
        }

        throw new Error(`unexpected request: ${url}`);
    };

    new Function('self', 'caches', 'fetch', 'atob', 'console', SOURCE)(
        self,
        options.caches ?? makeCaches(),
        fetchImpl,
        atob,
        { warn() {}, error() {}, log() {} },
    );

    return { listeners, subscribeCalls, posted, requested, created };
}

/** Fires one event at the worker and waits for whatever it passed to `waitUntil`. */
async function dispatch(worker: ReturnType<typeof loadWorker>, type: string, event: any = {}) {
    const listener = worker.listeners.get(type);
    assert.ok(listener, `the worker registers no ${type} listener`);

    let waited: Promise<unknown> = Promise.resolve();
    listener({ ...event, waitUntil(promise: Promise<unknown>) { waited = promise; } });
    await waited;
}

/** A hint written the way the page writes it, through the page's own helper. */
async function writeHint(store: any, applicationServerKey = KEY) {
    (globalThis as any).caches = store;
    await rememberSubscription({
        applicationServerKey,
        label: 'This Linux device',
        platform: 'linux',
        browser: 'Firefox',
    });
}

test('the worker listens for pushsubscriptionchange at all', () => {
    const worker = loadWorker();
    assert.ok(worker.listeners.has('pushsubscriptionchange'));
});

/**
 * The whole point: the browser rotated the subscription while nothing was open,
 * and the worker puts the account back in touch without anyone visiting a page.
 */
test('a rotated subscription is renewed and registered with the app closed', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.equal(worker.subscribeCalls.length, 1);
    assert.equal(worker.subscribeCalls[0].userVisibleOnly, true);
    assert.deepEqual(
        Array.from(worker.subscribeCalls[0].applicationServerKey as Uint8Array),
        Array.from(bytes(KEY)),
    );

    assert.equal(worker.posted.length, 1);
    assert.equal(worker.posted[0].endpoint, 'https://push.example/renewed');
    assert.equal(worker.posted[0].keys.p256dh, 'p256dh-for-https://push.example/renewed');
});

/**
 * The device list is how someone recognises which browser is which. A renewal
 * that dropped the label would replace a named row with "Unnamed device" — the
 * machine appearing to vanish and a stranger appearing beside it.
 */
test('the renewed registration keeps the name the device already had', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.equal(worker.posted[0].label, 'This Linux device');
    assert.equal(worker.posted[0].platform, 'linux');
    assert.equal(worker.posted[0].browser, 'Firefox');
});

/** A hint costs no network, which matters when the network is why it lapsed. */
test('a hinted renewal asks the server for nothing but the registration', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.deepEqual(worker.requested, ['/api/notifications/devices']);
});

/**
 * Some browsers have already made the replacement by the time they tell us.
 * Subscribing again would strand the one they made — unregistered, and holding
 * the registration this one needs.
 */
test('a replacement the browser already made is registered rather than duplicated', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store });
    await dispatch(worker, 'pushsubscriptionchange', {
        newSubscription: makeSubscription('https://push.example/browser-made'),
    });

    assert.equal(worker.subscribeCalls.length, 0);
    assert.equal(worker.posted[0].endpoint, 'https://push.example/browser-made');
});

/**
 * Everyone subscribed before this shipped has no hint, which on the day of
 * release is everyone. Chromium and Firefox both hand back the expiring
 * subscription, and the key it carried is the right one to renew under.
 */
test('a subscription made before hints existed is renewed from the key it carried', async () => {
    const worker = loadWorker({ caches: makeCaches() });
    await dispatch(worker, 'pushsubscriptionchange', {
        oldSubscription: { options: { applicationServerKey: bytes(KEY) } },
    });

    assert.equal(worker.subscribeCalls.length, 1);
    assert.deepEqual(
        Array.from(worker.subscribeCalls[0].applicationServerKey as Uint8Array),
        Array.from(bytes(KEY)),
    );
    assert.deepEqual(worker.requested, ['/api/notifications/devices']);
});

/** The hint wins over the carried key: it is the more recent of the two. */
test('the hint is preferred to the key the old subscription carried', async () => {
    const store = makeCaches();
    await writeHint(store, KEY);

    const worker = loadWorker({ caches: store });
    await dispatch(worker, 'pushsubscriptionchange', {
        oldSubscription: { options: { applicationServerKey: bytes(OTHER) } },
    });

    assert.deepEqual(
        Array.from(worker.subscribeCalls[0].applicationServerKey as Uint8Array),
        Array.from(bytes(KEY)),
    );
});

/** Last resort, and the only source that reflects a key rotated since. */
test('with neither a hint nor a carried key, the current server key is fetched', async () => {
    const worker = loadWorker({
        caches: makeCaches(),
        config: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: KEY },
    });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.ok(worker.requested.includes('/api/config'));
    assert.deepEqual(
        Array.from(worker.subscribeCalls[0].applicationServerKey as Uint8Array),
        Array.from(bytes(KEY)),
    );
});

/**
 * Subscribing under no key produces an endpoint VAPID cannot sign for, which
 * the push service refuses forever. Doing nothing leaves the person exactly
 * where they were, and the notifications page still repairs it.
 */
test('nothing is subscribed when there is no key to subscribe with', async () => {
    const worker = loadWorker({ caches: makeCaches(), config: null });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.equal(worker.subscribeCalls.length, 0);
    assert.equal(worker.posted.length, 0);
});

/** A server that answers without the key is no more use than one that is down. */
test('a config response missing the key subscribes to nothing', async () => {
    const worker = loadWorker({ caches: makeCaches(), config: { NEXT_PUBLIC_WS_URL: 'wss://x' } });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.equal(worker.subscribeCalls.length, 0);
});

/**
 * The event fires whenever the browser decides, so there may be no session to
 * register under. Keeping a subscription the server has never heard of would
 * leave the browser believing notifications are on while the settings page —
 * reading the server — shows them off, and no push could arrive either way.
 */
test('a registration the server rejects is not left behind in the browser', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store, registerStatus: 401 });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.equal(worker.posted.length, 1);
    assert.equal(worker.created.unsubscribed, 1);
});

test('a successful registration is left subscribed', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store });
    await dispatch(worker, 'pushsubscriptionchange');

    assert.equal(worker.created.unsubscribed, 0);
});

/**
 * `waitUntil` rejecting is an unhandled rejection inside the worker, which
 * browsers may treat as a reason to terminate it mid-renewal.
 */
test('a renewal that throws is contained rather than left unhandled', async () => {
    const store = makeCaches();
    await writeHint(store);

    const worker = loadWorker({ caches: store, subscribeThrows: true });
    await assert.doesNotReject(dispatch(worker, 'pushsubscriptionchange'));
    assert.equal(worker.posted.length, 0);
});

/**
 * Turning notifications off has to reach the worker too, or it still holds
 * everything needed to re-register the subscription just released.
 */
test('a forgotten subscription leaves the worker no hint to renew from', async () => {
    const store = makeCaches();
    await writeHint(store);

    (globalThis as any).caches = store;
    await forgetSubscription();

    const worker = loadWorker({ caches: store, config: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: OTHER } });
    await dispatch(worker, 'pushsubscriptionchange');

    // Fell through to the server's key, which is only reached with no hint.
    assert.ok(worker.requested.includes('/api/config'));
    assert.deepEqual(
        Array.from(worker.subscribeCalls[0].applicationServerKey as Uint8Array),
        Array.from(bytes(OTHER)),
    );
});
