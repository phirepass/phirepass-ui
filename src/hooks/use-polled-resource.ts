'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * A list that reloads itself on an interval.
 *
 * Extracted from the pattern `Nodes.tsx` established, because three pages had
 * started hand-rolling it and the interesting parts are the ones easiest to
 * leave out:
 *
 * - **A poll never shows the spinner.** Only the first load sets `loading`, so a
 *   background refresh does not flash the page back to a skeleton every 15s.
 * - **Only the first failure is inline.** Once a list is on screen, a failed
 *   poll toasts and leaves the last good data in place — replacing a working
 *   view with an error banner because one refresh timed out is worse than being
 *   briefly stale.
 * - **Late responses are discarded.** The disposed flag stops a slow request
 *   resolving after unmount, or after a newer one already landed.
 *
 * `load` must be stable — wrap it in `useCallback` — or the effect resubscribes
 * on every render and polls far faster than intended.
 */
export interface PolledResource<T> {
    data: T | undefined;
    loading: boolean;
    error: string | null;
    /** Reload now, e.g. after a mutation. Failures toast rather than going inline. */
    refresh: () => Promise<void>;
}

/** Matches the cadence `Nodes.tsx` already uses, so pages feel consistent. */
export const DEFAULT_POLL_INTERVAL_MS = 15_000;

export function usePolledResource<T>(
    load: () => Promise<T>,
    options?: { intervalMs?: number; errorMessage?: string },
): PolledResource<T> {
    const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const errorMessage = options?.errorMessage ?? 'Failed to load';

    const [data, setData] = useState<T | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadedOnceRef = useRef(false);
    const disposedRef = useRef(false);

    const messageFrom = useCallback(
        (err: unknown) => (err instanceof Error ? err.message : errorMessage),
        [errorMessage],
    );

    const refresh = useCallback(async () => {
        try {
            const next = await load();
            if (disposedRef.current) return;
            setData(next);
            setError(null);
            loadedOnceRef.current = true;
        } catch (err) {
            if (disposedRef.current) return;
            toast.error(messageFrom(err));
        }
    }, [load, messageFrom]);

    useEffect(() => {
        disposedRef.current = false;

        const tick = async (isFirst: boolean) => {
            try {
                const next = await load();
                if (disposedRef.current) return;
                setData(next);
                setError(null);
                loadedOnceRef.current = true;
            } catch (err) {
                if (disposedRef.current) return;
                if (loadedOnceRef.current) {
                    toast.error(messageFrom(err));
                } else {
                    setError(messageFrom(err));
                }
            } finally {
                if (!disposedRef.current && isFirst) setLoading(false);
            }
        };

        void tick(true);
        const timer = window.setInterval(() => { void tick(false); }, intervalMs);

        return () => {
            disposedRef.current = true;
            window.clearInterval(timer);
        };
    }, [load, intervalMs, messageFrom]);

    return { data, loading, error, refresh };
}
