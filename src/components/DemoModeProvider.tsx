'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setCachedProfile } from '@/app/dashboard/profile-cache';
import { clearCachedNodes, setNodesCacheSuspended } from '@/lib/nodesCache';

/**
 * Holds the demo switch, and while it is on, answers the dashboard's own API
 * calls from the sample fleet.
 *
 * The interception is a patched `window.fetch` rather than an API client every
 * page is expected to use. That is a real trade and worth stating: a global
 * patch is heavier machinery than a wrapper, but it cannot be *forgotten*. A
 * page that called plain `fetch` — as every page here does today — would
 * otherwise quietly show the account's real nodes next to the sample ones,
 * which is the one failure this mode must not have. The patch is narrow in
 * exchange: same-origin `/api/…` only, one known route table, everything else
 * straight through to the network, and it is removed the moment the switch goes
 * off (see `src/lib/demo/api.ts`).
 *
 * State only. Nothing is persisted, so a reload is always back on real data.
 */

interface DemoModeContextValue {
    /** What the switch says. Flips the instant it is clicked. */
    requested: boolean;
    /**
     * Whether the fixture is actually being served — the patch is installed.
     *
     * Distinct from `requested` because the fixture is loaded on demand, so
     * there is a moment after the click when the switch is on and `fetch` is
     * still the real one. Everything that reacts to demo mode reads *this*,
     * which is what makes the reaction safe: anything refetching because demo
     * mode came on is guaranteed to be answered by the fixture rather than by
     * the account's own data.
     */
    active: boolean;
    setRequested: (requested: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

/** Same-origin `/api/…` requests are the only ones the demo will answer. */
function apiPath(url: string): { path: string; params: URLSearchParams } | null {
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.origin !== window.location.origin) return null;
        if (!parsed.pathname.startsWith('/api/')) return null;

        return { path: parsed.pathname, params: parsed.searchParams };
    } catch {
        return null;
    }
}

export function DemoModeProvider({ children }: { children: ReactNode }) {
    const [requested, setRequested] = useState(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!requested) return;

        // The node list is cached in local storage to render instantly on the
        // next visit. Sample nodes must never end up in it — they would surface
        // as real ones after the switch goes off — so writes are suspended and
        // whatever is cached now is dropped. Turning the switch off drops it
        // again, and the page refetches.
        setNodesCacheSuspended(true);
        clearCachedNodes();

        let cancelled = false;
        let restore: (() => void) | null = null;

        // Loaded on demand. The fleet and its generator are a few tens of
        // kilobytes of fixtures, and this provider sits in the root layout —
        // nobody who is not giving a demo should be made to download them.
        void import('@/lib/demo/api').then(({ demoApiResponse }) => {
            if (cancelled) return;

            const original = window.fetch;

            window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === 'string'
                    ? input
                    : input instanceof URL
                        ? input.href
                        : input.url;

                const target = apiPath(url);
                if (target) {
                    const request = input instanceof Request ? input : null;
                    const method = init?.method ?? request?.method ?? 'GET';

                    const readBody = async (): Promise<Record<string, unknown>> => {
                        try {
                            const raw = typeof init?.body === 'string'
                                ? init.body
                                : request
                                    ? await request.clone().text()
                                    : '';
                            return raw ? JSON.parse(raw) as Record<string, unknown> : {};
                        } catch {
                            // Matches the routes, which all parse with a
                            // `.catch(() => ({}))` and let validation produce
                            // the error message.
                            return {};
                        }
                    };

                    const response = await demoApiResponse(method, target.path, target.params, readBody);
                    if (response) return response;
                }

                return original(input, init);
            };

            restore = () => { window.fetch = original; };

            // The signed-in identity is cached for the session so that moving
            // in and out of /dashboard does not re-verify the auth cookie every
            // time. Dropping it makes the layout ask again — now through the
            // patch, so the header names the person the sample fleet belongs
            // to. Cleared on the way out too, for the same reason in reverse.
            setCachedProfile(null);
            setActive(true);
        });

        return () => {
            cancelled = true;
            restore?.();
            setNodesCacheSuspended(false);
            clearCachedNodes();
            setCachedProfile(null);
            setActive(false);
        };
    }, [requested]);

    const value = useMemo<DemoModeContextValue>(
        () => ({ requested, active, setRequested }),
        [requested, active],
    );

    return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

/**
 * Whether sample data is being served right now — the patch is in place, so a
 * request made in response to this will be answered by the fixture.
 *
 * `false` everywhere outside the provider.
 */
export function useDemoMode(): boolean {
    return useContext(DemoModeContext)?.active ?? false;
}

/**
 * The switch itself, for the settings page.
 *
 * Reports `requested` rather than `active`, so the control it draws responds to
 * the click that caused it rather than to the fixture finishing loading a
 * moment later. Separate from `useDemoMode()` so that reading the state — which
 * most callers do — cannot be mistaken for permission to change it.
 */
export function useDemoModeSwitch(): { enabled: boolean; setEnabled: (enabled: boolean) => void } {
    const value = useContext(DemoModeContext);

    if (!value) {
        throw new Error('useDemoModeSwitch must be used within a DemoModeProvider');
    }

    return { enabled: value.requested, setEnabled: value.setRequested };
}
