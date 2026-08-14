'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes the dashboard installable.
 *
 * Production only. In development the worker would sit between the browser and
 * the dev server's HMR requests, and a stale registration is a genuinely
 * confusing thing to debug — so local builds stay untouched. It renders nothing.
 */
export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
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
