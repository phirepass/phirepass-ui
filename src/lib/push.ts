/**
 * Web Push, browser half.
 *
 * A subscription belongs to a service worker registration, so everything here
 * waits on `navigator.serviceWorker.ready` — see `ServiceWorkerRegistration`
 * for why that registration now happens in development too.
 */

export type PushSupport =
    /** Everything needed is present. */
    | 'ok'
    /** The browser has no Push API (Safari before 16.4, most in-app browsers). */
    | 'unsupported'
    /** Push requires a secure context; http:// on a LAN address will not do. */
    | 'insecure';

export function pushSupport(): PushSupport {
    if (typeof window === 'undefined') return 'unsupported';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'unsupported';
    }
    // localhost counts as secure, which is what makes local development work at
    // all; a dev server reached over the network by IP does not.
    if (!window.isSecureContext) return 'insecure';
    return 'ok';
}

export function permissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'default';
    return Notification.permission;
}

/**
 * VAPID public keys travel as base64url; `applicationServerKey` wants bytes.
 *
 * `atob` rather than `window.atob` so this module can be exercised outside a
 * browser — the two are the same function, and the pure half of this file is
 * where the key comparison below is tested.
 */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
        output[i] = raw.charCodeAt(i);
    }
    return output;
}

/**
 * Whether a subscription the browser already holds was created under the key
 * this server now signs with.
 *
 * A subscription is bound at `subscribe()` time to the `applicationServerKey`
 * it was given, and the push service enforces that binding forever: a push
 * signed by any other key is refused with `403 permission denied: invalid JWT
 * provided`. Nothing about that refusal says the subscription is stale — it
 * reads as a credential problem — and it is deliberately not treated as
 * evidence the subscription is dead, so the row survives and every later
 * notification to that browser is refused the same way.
 *
 * Reusing an existing subscription without this check is what makes a VAPID
 * key rotation permanent: the browser keeps handing back the subscription made
 * under the old key, the server keeps storing it, and no amount of fixing the
 * environment ever reaches it.
 *
 * `existing` is `subscription.options.applicationServerKey`, which is:
 *   - `undefined` on a browser too old to expose `options` at all. Nothing can
 *     be concluded, so the subscription is kept — re-subscribing on a hunch
 *     would churn an endpoint that may well be fine.
 *   - `null` when the subscription carries no application server key. It cannot
 *     be pushed to with VAPID under any key, so it has to be replaced.
 */
export function subscribedWithKey(
    existing: ArrayBuffer | null | undefined,
    vapidPublicKey: string,
): boolean {
    if (existing === undefined) return true;
    if (existing === null) return false;

    const wanted = urlBase64ToUint8Array(vapidPublicKey);
    const held = new Uint8Array(existing);

    if (held.length !== wanted.length) return false;
    return held.every((byte, index) => byte === wanted[index]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    if (pushSupport() !== 'ok') return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
}

/**
 * Prompts for permission if it has not been decided, then subscribes.
 *
 * `userVisibleOnly: true` is not optional in Chrome, and it is a promise the
 * service worker's `push` handler has to keep — see the note there.
 *
 * Returns `null` when the person declines. A denial is sticky: the browser will
 * not ask again for this origin, so the caller has to say so rather than
 * offering the button a second time.
 *
 * A subscription the browser already holds is reused only when it was issued
 * under `vapidPublicKey`; one made under a different key is dropped and
 * replaced, because the push service refuses it for good.
 */
export async function subscribe(vapidPublicKey: string): Promise<PushSubscription | null> {
    if (pushSupport() !== 'ok') return null;

    const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
        // Only if it was issued under the key this server signs with — see
        // `subscribedWithKey`. Handing back one made under an older key
        // registers an endpoint the push service will refuse for good.
        if (subscribedWithKey(existing.options?.applicationServerKey, vapidPublicKey)) {
            return existing;
        }
        await existing.unsubscribe();
    }

    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
}

/** Drops this browser's subscription. Safe to call when there is not one. */
export async function unsubscribeCurrent(): Promise<void> {
    const subscription = await currentSubscription();
    if (subscription) {
        await subscription.unsubscribe();
    }
}

/**
 * Mirrors `endpointHash` in `src/app/lib/push.ts`.
 *
 * The server never returns endpoints — they are capability URLs — so this is how
 * the page works out which row in the device list is the browser it is running
 * in. Both sides must stay the same: sha-256, hex, first 32 characters.
 */
export async function hashEndpoint(endpoint: string): Promise<string> {
    const bytes = new TextEncoder().encode(endpoint);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
}

/**
 * Where the page leaves what the service worker needs to renew a subscription
 * on its own.
 *
 * These two names are a contract with `public/sw.js`, which reads the same
 * cache under the same URL and cannot import them — it is served raw, outside
 * the bundle. A disagreement is silent: the worker finds no hint, falls back to
 * whatever the browser or `/api/config` will tell it, and quietly loses the
 * device's label for every renewal. `src/lib/service-worker.test.ts` reads both
 * halves and fails if they drift.
 */
export const PUSH_HINT_CACHE = 'phirepass-push-hint';
export const PUSH_HINT_URL = '/__phirepass-push-hint';

export interface PushHint {
    /** The VAPID public key this browser subscribed under, base64url. */
    applicationServerKey: string;
    label: string;
    platform: string;
    browser: string;
}

/**
 * Records what a renewal will need, for the case the page is not running when
 * one is due — which is the usual case, since browsers rotate subscriptions on
 * their own schedule and mostly while the app is closed.
 *
 * Best-effort on purpose. Storage can be full, blocked, or absent in a private
 * window, and none of that should fail an enable that otherwise succeeded: the
 * subscription is already registered by the time this runs, and a missing hint
 * costs a fallback, not the notification.
 */
export async function rememberSubscription(hint: PushHint): Promise<void> {
    if (typeof caches === 'undefined') return;

    try {
        const cache = await caches.open(PUSH_HINT_CACHE);
        await cache.put(
            PUSH_HINT_URL,
            new Response(JSON.stringify(hint), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    } catch (error) {
        console.warn('[phirepass] could not record the push renewal hint', error);
    }
}

/**
 * Drops the hint when this browser is no longer subscribed.
 *
 * Without this, a person who turns notifications off leaves behind everything
 * the worker needs to turn them back on — and `pushsubscriptionchange` can
 * still fire afterwards for the subscription they just released.
 */
export async function forgetSubscription(): Promise<void> {
    if (typeof caches === 'undefined') return;

    try {
        const cache = await caches.open(PUSH_HINT_CACHE);
        await cache.delete(PUSH_HINT_URL);
    } catch (error) {
        console.warn('[phirepass] could not clear the push renewal hint', error);
    }
}
