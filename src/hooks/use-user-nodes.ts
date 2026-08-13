'use client';

import { useEffect, useState } from 'react';

import type { TunnelNode } from '@/types/node';

/** The little a picker needs to know about a node. */
export interface UserNodeOption {
    id: string;
    name: string;
    online: boolean;
}

interface UseUserNodesResult {
    nodes: UserNodeOption[];
    loading: boolean;
    error: string | null;
}

/**
 * The current user's nodes, for anywhere one has to be chosen.
 *
 * Ownership is not filtered here and must not be: `GET /api/nodes` resolves the
 * session itself and only ever returns rows belonging to that user, so the
 * browser is never trusted to scope the list. A user therefore cannot point a
 * monitor at somebody else's agent by editing what it sends, because the id
 * would not survive the same check on write.
 *
 * `enabled` exists so a form that has no use for the list (a domain monitor,
 * which has no vantage to choose) does not fetch it at all.
 */
export function useUserNodes(enabled: boolean = true): UseUserNodesResult {
    const [nodes, setNodes] = useState<UserNodeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Returning early rather than clearing `loading` here: setting state
        // synchronously in an effect body cascades a render, and the disabled
        // case is derived on the way out instead.
        if (!enabled) return;

        let disposed = false;

        const load = async () => {
            try {
                const response = await fetch('/api/nodes');
                if (!response.ok) {
                    throw new Error(`Failed to load nodes: ${response.statusText}`);
                }

                const payload = await response.json() as TunnelNode[];
                if (disposed) return;

                setNodes(
                    payload
                        .map((node) => ({
                            id: node.id,
                            name: node.name || node.id,
                            // `status` is the newer field; fall back to the
                            // boolean for nodes served from an older cache.
                            online: node.status ? node.status === 'online' : node.is_online,
                        }))
                        // Online first, then alphabetical: the ones that can
                        // actually run a probe right now are the likely pick.
                        .sort((a, b) => {
                            if (a.online !== b.online) return a.online ? -1 : 1;
                            return a.name.localeCompare(b.name);
                        })
                );
                setError(null);
            } catch (loadError) {
                if (disposed) return;
                setError(loadError instanceof Error ? loadError.message : 'Failed to load nodes');
            } finally {
                if (!disposed) setLoading(false);
            }
        };

        void load();
        return () => {
            disposed = true;
        };
    }, [enabled]);

    // A disabled hook never fetched, so it reports nothing rather than the stale
    // result of an earlier enabled render.
    if (!enabled) {
        return { nodes: [], loading: false, error: null };
    }

    return { nodes, loading, error };
}
