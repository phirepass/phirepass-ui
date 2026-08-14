/*
 * Minimal service worker — deliberately.
 *
 * Chrome will not offer "install" without a registered worker that has a fetch
 * handler, and that is the only reason this file exists. It caches one page:
 * the offline fallback. It never caches HTML, API responses or anything else,
 * because everything behind /dashboard is per-user and authenticated, and a
 * cache hit there could show one person a page rendered for another.
 *
 * Non-navigation requests fall through to the network untouched.
 */
const CACHE = 'phirepass-shell-v1';
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
