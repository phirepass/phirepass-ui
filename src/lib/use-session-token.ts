'use client';

/**
 * The short-lived JWT every session widget authenticates with.
 *
 * One copy, shared by all three panels. It was three, fetched independently, so
 * opening a shell and a file browser asked for two tokens that were
 * interchangeable — and each panel had its own retry, its own error string and
 * its own idea of when to give up.
 *
 * Fetched once, on the first session of any kind, and kept for as long as the
 * page lives. It is deliberately **not** refetched per session: the token
 * authenticates the account, not the session, and a widget that outlives its
 * expiry reconnects through the session's own reconnect rather than through a
 * silent token swap underneath it.
 */

import { useCallback, useEffect, useState } from 'react';

export interface SessionToken {
    token: string | null;
    loading: boolean;
    error: string | null;
    /** Ask again after a failure. */
    retry: () => void;
}

export function useSessionToken(needed: boolean): SessionToken {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        // `error` is in the guard rather than the dependencies: a failed fetch
        // must not re-run on every render, and `retry` is what clears it.
        if (!needed || token || loading || error) {
            return;
        }

        let alive = true;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch('/api/auth/websocket-token', { credentials: 'include' });

                if (!response.ok) {
                    throw new Error(`Failed to fetch session token (${response.status})`);
                }

                const payload = await response.json() as { token?: string };
                if (!payload.token) {
                    throw new Error('Token response is missing token');
                }

                if (alive) {
                    setToken(payload.token);
                }
            } catch (err) {
                if (alive) {
                    setError(err instanceof Error ? err.message : 'Unable to load session token');
                }
            } finally {
                if (alive) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => { alive = false; };
    }, [needed, token, loading, error, attempt]);

    const retry = useCallback(() => {
        setError(null);
        setAttempt((current) => current + 1);
    }, []);

    return { token, loading, error, retry };
}
