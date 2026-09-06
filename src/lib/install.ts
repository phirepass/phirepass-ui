'use client';

/**
 * How this page is being displayed, whether it could be installed, and the
 * browser event that would do it.
 *
 * Two very different callers need the same answers: `src/lib/push.ts` has to
 * tell "this browser has no Push API" apart from "this browser has no Push API
 * *yet*", and `InstallBanner` has to know whether there is anything left to
 * offer. Both live here so the platform test is written once.
 *
 * Every function answers `false`/`'none'` off a browser, so nothing has to
 * guard a server render.
 */

import { useCallback, useSyncExternalStore } from 'react';

/**
 * iOS or iPadOS, whatever the browser calls itself.
 *
 * Every engine on iOS is WebKit, so the browser name never changes the answer —
 * Chrome on an iPhone is Safari wearing a coat, with Safari's rules about push.
 * iPadOS 13 and later report themselves as `Macintosh`, which is why the touch
 * point count is part of the test: a desktop Mac reports zero.
 */
export function isIos(): boolean {
    if (typeof navigator === 'undefined') return false;

    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return true;

    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * Running as an installed app rather than in a browser tab.
 *
 * Two tests because iOS answers only one of them: `display-mode: standalone` is
 * the standard, and `navigator.standalone` is the non-standard property Safari
 * has carried since long before the standard existed.
 */
export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;

    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;

    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * The event Chromium fires when it is willing to install this app. Not in
 * `lib.dom.d.ts` — it is a Chromium extension rather than a standard — so the
 * shape it is used through is written out here.
 */
export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * What installing looks like on this platform.
 *
 * - `prompt` — Chromium will do it for us, once it has offered the event.
 * - `manual` — iOS can install, but only the person can start it: there is no
 *   API for the Share sheet, so the only honest thing is to say where it is.
 * - `none` — already installed, or a browser with nowhere to install to.
 */
export type InstallRoute = 'prompt' | 'manual' | 'none';

const DISMISSED_KEY = 'phirepass:install-dismissed';

/**
 * The event, caught at module scope.
 *
 * Chromium fires `beforeinstallprompt` once, early, and does not re-fire it for
 * a listener that arrives late — which a component inside the dashboard layout
 * reliably would, since that layout waits on `/api/profile` before rendering
 * anything. Listening from module evaluation is the only placement that cannot
 * miss it; the hook then reads what was caught rather than hoping to be first.
 */
let captured: BeforeInstallPromptEvent | null = null;
let dismissed = false;
const listeners = new Set<() => void>();

function announce() {
    listeners.forEach((notify) => notify());
}

if (typeof window !== 'undefined') {
    try {
        dismissed = window.localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
        // A browser that refuses storage gets asked once per visit rather than
        // never, which is the better failure of the two.
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        // Suppressing the default is what stops Chromium showing its own mini
        // infobar, and it is the price of being allowed to call `prompt()`
        // later, at a moment of our choosing.
        event.preventDefault();
        captured = event as BeforeInstallPromptEvent;
        announce();
    });

    // Installed from our button or from the browser's own menu, it makes no
    // difference: there is nothing left to offer.
    window.addEventListener('appinstalled', () => {
        captured = null;
        announce();
    });
}

function subscribe(notify: () => void): () => void {
    listeners.add(notify);
    return () => { listeners.delete(notify); };
}

function readRoute(): InstallRoute {
    if (isStandalone()) return 'none';
    if (captured) return 'prompt';
    return isIos() ? 'manual' : 'none';
}

/** Both snapshots are primitives, so `useSyncExternalStore` can compare them by value. */
function readDismissed(): boolean {
    return dismissed;
}

const serverRoute = (): InstallRoute => 'none';
const serverDismissed = () => true;

export function useInstallPrompt() {
    const route = useSyncExternalStore(subscribe, readRoute, serverRoute);
    const isDismissed = useSyncExternalStore(subscribe, readDismissed, serverDismissed);

    const dismiss = useCallback(() => {
        dismissed = true;
        try {
            window.localStorage.setItem(DISMISSED_KEY, '1');
        } catch { /* A preference, not state anything depends on. */ }
        announce();
    }, []);

    const promptInstall = useCallback(async () => {
        const event = captured;
        if (!event) return;

        await event.prompt();
        const { outcome } = await event.userChoice;

        // Chromium will not let the same event be used twice, whichever way it
        // went. Accepting is followed by `appinstalled`; declining is a "not
        // now" that should not be asked again.
        captured = null;
        if (outcome === 'dismissed') dismiss();
        else announce();
    }, [dismiss]);

    return { route, dismissed: isDismissed, dismiss, promptInstall };
}
