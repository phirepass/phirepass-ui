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
