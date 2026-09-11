'use client';

/**
 * The short-lived JWT every session widget authenticates with.
 *
 * One copy for the page, fetched on the first session of any kind and kept for
 * as long as the page lives. It is deliberately **not** refetched per session:
 * the token authenticates the account, not the session, and a widget that
 * outlives its expiry reconnects through the session's own reconnect rather than
 * through a silent token swap underneath it.
 *
 * **The request lives outside React, and that is the whole point.**
 *
 * It used to live inside the effect, with `loading` and `error` in the
 * dependency array and an `alive` flag gating the result. Those two facts do not
 * survive each other: the effect body sets `loading` to true, which changes a
 * dependency, which runs the cleanup — setting `alive = false` on the request
 * that had just been started — and the re-run then returns early because
 * `loading` is now true. The fetch completed, the response was thrown away, and
 * the panel sat on "Loading session token…" for ever. Nothing ever connected.
 *
 * Holding the promise at module scope removes the failure mode rather than
 * patching it. A remount, a StrictMode double-invocation, a second panel
 * mounting in the same tick — all of them join the request already in flight
 * instead of starting or cancelling one, and the result cannot be lost by
 * whichever component happened to ask first unmounting. It is the same shape as
 * `lib/workspaces.ts`, for the same reason.
 */

import { useCallback, useEffect, useState } from 'react';

export interface SessionToken {
    token: string | null;
    loading: boolean;
    error: string | null;
    /** Ask again after a failure. */
    retry: () => void;
}

let cached: string | null = null;
let inflight: Promise<string> | null = null;

/**
 * The account's websocket token, fetched at most once for the page.
 *
 * A rejection is deliberately **not** cached: `inflight` is cleared either way,
 * so the next caller — a retry, or simply another panel opening — starts a fresh
 * request rather than inheriting a failure from minutes ago.
 */
export function loadSessionToken(): Promise<string> {
    if (cached) return Promise.resolve(cached);
    if (inflight) return inflight;

    inflight = fetch('/api/auth/websocket-token', { credentials: 'include' })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch session token (${response.status})`);
            }

            const payload = await response.json() as { token?: string };
            if (!payload.token) {
                throw new Error('Token response is missing token');
            }

            cached = payload.token;
            return cached;
        })
        .finally(() => {
            inflight = null;
        });

    return inflight;
}

/** Drop the cached token, so the next session asks for a new one. Sign-out uses this. */
export function clearSessionToken() {
    cached = null;
}

export function useSessionToken(needed: boolean): SessionToken {
    // Seeded from the cache, so a panel mounting after the token has arrived
    // renders its widgets on the first frame rather than flashing the loader.
    const [token, setToken] = useState<string | null>(() => cached);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!needed || token) {
            return;
        }

        let alive = true;

        loadSessionToken().then(
            (value) => { if (alive) setToken(value); },
            (err: unknown) => {
                if (alive) {
                    setError(err instanceof Error ? err.message : 'Unable to load session token');
                }
            },
        );

        // Only stops *this* component from setting state after it has gone. The
        // request itself is not cancelled and its result is not discarded — it
        // is cached above, so whoever asks next already has it.
        return () => { alive = false; };
    }, [needed, token, attempt]);

    /*
     * Derived, never stored.
     *
     * A `loading` flag in state is a third thing that has to agree with the
     * other two, and keeping it in the dependency array is what broke this hook
     * in the first place. "Wanted, not here yet, and not failed" is loading, and
     * there is nothing else it could mean.
     */
    const loading = needed && token === null && error === null;

    const retry = useCallback(() => {
        setError(null);
        setAttempt((current) => current + 1);
    }, []);

    return { token, loading, error, retry };
}
