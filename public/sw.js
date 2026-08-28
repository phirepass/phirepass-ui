/*
 * Minimal service worker — deliberately.
 *
 * Two jobs, and nothing else. Chrome will not offer "install" without a
 * registered worker that has a fetch handler, so there is one, and it caches
 * exactly one page: the offline fallback. It never caches HTML, API responses
 * or anything else, because everything behind /dashboard is per-user and
 * authenticated, and a cache hit there could show one person a page rendered
 * for another. Non-navigation requests fall through to the network untouched.
 *
 * The second job is Web Push. A push subscription is bound to a service worker
 * registration, so notifications can only be received here — see the `push`
 * handler at the bottom.
 */
/*
 * Bump this whenever offline.html changes.
 *
 * The fallback is only ever written at `install`, and a worker only installs
 * when the browser sees this file's bytes differ from the copy it holds. So an
 * edit to offline.html alone reaches nobody who already has the app installed —
 * they keep being served whatever was cached the day they installed it. Changing
 * the version changes this file, which triggers the update, which re-fetches the
 * page; `activate` then drops the previous cache.
 *
 * v2: offline.html carries its mark inline instead of linking /icon-192.png,
 * which was never cached and so never loaded offline.
 */
const CACHE = 'phirepass-shell-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll([OFFLINE_URL]))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only page loads are handled, and only to show the offline page when the
    // network is gone. Everything else — API calls, WebSockets, assets — is
    // left entirely alone.
    if (request.method !== 'GET' || request.mode !== 'navigate') {
        return;
    }

    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});


/**
 * The severity icons, by the name the courier sends.
 *
 * An allow-list, not a lookup with a passthrough: anything unrecognised — a
 * missing field, an older sender, a payload that is not ours — falls back to the
 * ordinary mark, which is always a correct thing to show.
 */
const NOTIFICATION_ICONS = {
    alert: '/icon-alert-192.png',
    warn: '/icon-warn-192.png',
    default: '/icon-192.png',
};

function iconFor(name) {
    return NOTIFICATION_ICONS[name] || NOTIFICATION_ICONS.default;
}

/*
 * Web Push.
 *
 * The subscription is created with `userVisibleOnly: true`, which is a promise
 * to the browser that every push results in something the person can see. Break
 * it and Chrome starts showing "This site has been updated in the background"
 * on your behalf, then eventually revokes the permission. So this handler shows
 * a notification on every path, including the ones where the payload is missing
 * or malformed — a generic banner is a far cheaper failure than losing the
 * permission.
 */
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        // Non-JSON payload. Fall through to the defaults below.
    }

    const title = payload.title || 'Phirepass';

    event.waitUntil(
        self.registration.showNotification(title, {
            body: payload.body || '',
            // The large icon in the shade: full colour, shown as drawn.
            //
            // The sender picks it, because there is no way to tint an icon at
            // display time — no colour option in showNotification is honoured
            // anywhere — so severity has to arrive as a different image.
            // scripts/build-notification-icons.mjs draws the alternates from the
            // same mark: `icon-alert-192.png` for an outage, `icon-warn-192.png`
            // for a degradation. Restricted to a known set rather than used as
            // sent: this value crosses a push service, and a URL from the wire is
            // not something to hand to the shade.
            icon: iconFor(payload.icon),
            // The status-bar mark, and a different kind of asset entirely.
            // Android discards the colour and tints the alpha channel, so a
            // full-colour tile arrives as a solid white rectangle — badge-96
            // is the mark as a transparent silhouette. iOS ignores both of
            // these and uses the home-screen icon (src/app/apple-icon.png).
            badge: '/badge-96.png',
            // Same tag replaces rather than stacks, so a node flapping does not
            // bury the rest of the shade under twenty identical banners.
            tag: payload.tag || 'phirepass',
            data: { url: payload.url || '/dashboard/nodes' },
        }),
    );
});

/*
 * Clicking a notification should land in the tab that is already open, if there
 * is one — opening a second dashboard alongside the first is the behaviour
 * people complain about.
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const target = (event.notification.data && event.notification.data.url) || '/dashboard/nodes';

    event.waitUntil(
        (async () => {
            const clients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });

            for (const client of clients) {
                if (new URL(client.url).origin === self.location.origin) {
                    await client.focus();
                    if ('navigate' in client) {
                        await client.navigate(target);
                    }
                    return;
                }
            }

            await self.clients.openWindow(target);
        })(),
    );
});


/*
 * Web Push, second half: keeping the subscription alive.
 *
 * A push subscription is not permanent. Browsers replace one whenever the push
 * service migrates, storage is reclaimed, or the endpoint has simply sat unused
 * long enough — and they do it whether or not the app is open. When that
 * happens the old endpoint stops working, the sender gets 404/410 and prunes the
 * row, and nothing reconnects the two. The symptom is silence, which is the one
 * failure a notification system cannot afford: the person believes they are
 * covered.
 *
 * `pushsubscriptionchange` is the only notice the browser gives, and it is
 * delivered here rather than to the page precisely because the page is usually
 * not running. So the worker has to be able to re-subscribe and re-register
 * without it — which means having, on its own, the application server key to
 * subscribe under and the labels the device list shows.
 *
 * Not universal: Chromium fires this reliably, Firefox fires it, Safari does
 * not implement it at all. On Safari a rotated subscription is still only healed
 * by opening the notifications page. That is a reason to have this, not a reason
 * to skip it.
 */

/**
 * Where the page leaves what this worker needs to act alone.
 *
 * The Cache API rather than IndexedDB because both sides already have it and
 * the payload is one small JSON blob; the URL is a path no route serves, so a
 * cache miss can only mean "the page never wrote one". Mirrors
 * `PUSH_HINT_CACHE`/`PUSH_HINT_URL` in src/lib/push.ts — the two must name the
 * same cache or the worker silently falls back for every user.
 */
const PUSH_HINT_CACHE = 'phirepass-push-hint';
const PUSH_HINT_URL = '/__phirepass-push-hint';

/** Mirrors `urlBase64ToUint8Array` in src/lib/push.ts. */
function base64UrlToBytes(base64Url) {
    const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
}

async function readPushHint() {
    try {
        const cache = await caches.open(PUSH_HINT_CACHE);
        const response = await cache.match(PUSH_HINT_URL);
        return response ? await response.json() : null;
    } catch {
        // A hint that cannot be read is a hint that is not there.
        return null;
    }
}

/**
 * The key to subscribe under, from the most trustworthy source available.
 *
 * Three sources, in this order and each earning its place:
 *
 *   1. The hint, when the page has written one. Needs no network, at a moment
 *      the network may well be why the subscription lapsed.
 *   2. The key the expiring subscription itself carried. Covers everyone who
 *      subscribed before the hint existed — which, the day this ships, is
 *      everyone. Chromium and Firefox both populate `oldSubscription`.
 *   3. `/api/config`, which is public and unauthenticated. The last resort, and
 *      the only one that reflects a key rotated since this browser subscribed.
 *
 * `null` means there is nothing to subscribe with, which is not an error worth
 * throwing over — it is a browser this worker cannot help.
 */
async function applicationServerKeyFor(event, hint) {
    if (hint && hint.applicationServerKey) {
        return base64UrlToBytes(hint.applicationServerKey);
    }

    const carried = event.oldSubscription
        && event.oldSubscription.options
        && event.oldSubscription.options.applicationServerKey;
    if (carried) {
        return carried;
    }

    try {
        const response = await fetch('/api/config', { cache: 'no-store' });
        if (!response.ok) return null;
        const config = await response.json();
        const key = config && config.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        return key ? base64UrlToBytes(key) : null;
    } catch {
        return null;
    }
}

async function renewSubscription(event) {
    const hint = await readPushHint();

    // Some browsers have already made the replacement and hand it over; making
    // a second one would leave the first unregistered and unreachable.
    let subscription = event.newSubscription || null;

    if (!subscription) {
        const key = await applicationServerKeyFor(event, hint);
        if (!key) {
            console.warn('[phirepass] push subscription expired and there is no key to renew it with');
            return;
        }

        subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
        });
    }

    const json = subscription.toJSON();

    // Same-origin, so the session cookie rides along if there is one. There may
    // not be — this fires whenever the browser decides, not when someone is
    // signed in — and an unauthenticated attempt is answered 500 by the route
    // and handled below like any other rejection.
    //
    // The row holding the *old* endpoint is deliberately left alone: this worker
    // cannot prove which row that was, and the sender prunes it on the first
    // push the dead endpoint refuses.
    const response = await fetch('/api/notifications/devices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: json.keys,
            // Carried from the hint so a renewed subscription keeps the name it
            // had. Absent, the row arrives unlabelled and the device list shows
            // a machine nobody recognises next to the one that vanished.
            label: hint ? hint.label : undefined,
            platform: hint ? hint.platform : undefined,
            browser: hint ? hint.browser : undefined,
        }),
    });

    if (!response.ok) {
        // The browser would otherwise hold a subscription the server has never
        // heard of: pushes could not reach it and the settings page would show
        // notifications off while the browser thought them on. Dropping it keeps
        // the two in step, and matches what the page does when registering
        // fails. Recovery is the person re-enabling, which is where they would
        // have ended up anyway.
        console.warn('[phirepass] could not register the renewed push subscription', response.status);
        await subscription.unsubscribe();
    }
}

self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        renewSubscription(event).catch((error) => {
            console.warn('[phirepass] push subscription renewal failed', error);
        }),
    );
});
