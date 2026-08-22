'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes the dashboard installable — and, since
 * a push subscription is bound to a service worker registration, the one that
 * receives notifications.
 *
 * This used to be production-only, on the grounds that a stale registration is a
 * confusing thing to debug locally. That reasoning lost to a harder constraint:
 * the notifications page is dev-gated, so if the worker never registers in
 * development then the one place the feature is reachable is the one place it
 * cannot work. It now registers everywhere.
 *
 * The original worry is largely answered by the worker itself — its fetch
 * handler only intercepts requests with `mode === 'navigate'`, and only when the
 * network rejects outright, so HMR, API calls and WebSockets never reach it. If
 * a stale registration does need clearing: Application → Service Workers →
 * Unregister, or `navigator.serviceWorker.getRegistrations()` then `.unregister()`.
 *
 * It renders nothing.
 */
export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const register = () => {
            navigator.serviceWorker.register('/sw.js').catch((error) => {
                // Installability is a progressive enhancement: if the worker
                // cannot register, the app still works exactly as before.
                console.warn('[phirepass] service worker registration failed', error);
            });
        };

        // After load, so registration never competes with the first paint.
        if (document.readyState === 'complete') {
            register();
        } else {
            window.addEventListener('load', register);
            return () => window.removeEventListener('load', register);
        }
    }, []);

    return null;
}
