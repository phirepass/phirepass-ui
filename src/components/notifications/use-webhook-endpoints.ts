'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { WebhookEndpoint } from '@/types/notification';

/**
 * The webhook list, owned by the page rather than by the tab that renders it.
 *
 * This used to live inside `WebhookChannel`, which was the obvious place for it
 * — until you count what depends on the list from *outside* that component: the
 * count on the tab trigger, the "any destination at all" test that decides
 * whether the event switches are live, the Send test button, and the failing
 * endpoint alert. `WebhookChannel` is rendered inside a `TabsContent`, and Radix
 * does not mount inactive tab content, so none of those had an answer until
 * somebody clicked Webhooks: the tab read `0` next to a real endpoint, and an
 * account whose only destination was a webhook opened with its event switches
 * greyed out.
 *
 * Fetching here fixes all four at once, and it is the honest ownership anyway —
 * the list is page state that one tab happens to also render. What stays in
 * `WebhookChannel` is everything that genuinely is local to it: the dialogs, the
 * in-flight test, the row being edited.
 */
export interface WebhookEndpoints {
    endpoints: WebhookEndpoint[];
    /** True only on the first load. A refresh leaves the current rows on screen. */
    loading: boolean;
    /**
    * Re-reads the list. Throws on a failed response so a caller mid-mutation
    * ("endpoint added") can report its own failure rather than showing a
    * success toast over a stale list.
    */
    refresh: () => Promise<void>;
    /**
    * Applies one field change to one row without a round trip.
    *
    * For the optimistic pause switch, which has to move under the finger and
    * roll back on failure — the same call does both, with the old value. Every
    * other mutation goes through the server and then `refresh`, because only the
    * server knows what the row became.
    */
    patch: (id: string, changes: Partial<WebhookEndpoint>) => void;
}

export function useWebhookEndpoints(): WebhookEndpoints {
    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const response = await fetch('/api/notifications/webhooks', { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`webhooks ${response.status}`);
        }

        const payload = await response.json() as { webhooks?: WebhookEndpoint[] };
        setEndpoints(payload.webhooks ?? []);
    }, []);

    useEffect(() => {
        let disposed = false;

        void (async () => {
            try {
                await refresh();
            } catch (error) {
                console.warn('[notifications] failed to load webhooks', error);
                if (!disposed) toast.error('Could not load your webhook endpoints');
            } finally {
                if (!disposed) setLoading(false);
            }
        })();

        return () => { disposed = true; };
    }, [refresh]);

    const patch = useCallback((id: string, changes: Partial<WebhookEndpoint>) => {
        setEndpoints((current) => current.map((row) => (
            row.id === id ? { ...row, ...changes } : row
        )));
    }, []);

    return { endpoints, loading, refresh, patch };
}
