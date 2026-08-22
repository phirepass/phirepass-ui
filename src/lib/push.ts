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
 */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
        output[i] = raw.charCodeAt(i);
    }
    return output;
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
 */
export async function subscribe(vapidPublicKey: string): Promise<PushSubscription | null> {
    if (pushSupport() !== 'ok') return null;

    const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

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
