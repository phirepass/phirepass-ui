import { TunnelNode } from '@/types/node';

const NODES_CACHE_KEY = 'phirepass:nodes:cache';

/**
 * Set while the node list on screen is not the account's own — demo mode (see
 * `DemoModeProvider`). Reads still work; writes are dropped, because a cached
 * sample node would come back as a real one on the next visit and there is
 * nothing in the cached shape to tell the two apart.
 */
let suspended = false;

export function setNodesCacheSuspended(value: boolean) {
    suspended = value;
}

export function getCachedNodes(): TunnelNode[] | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(NODES_CACHE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as TunnelNode[] : null;
    } catch {
        return null;
    }
}

export function setCachedNodes(nodes: TunnelNode[]) {
    if (typeof window === 'undefined' || suspended) {
        return;
    }

    try {
        window.localStorage.setItem(NODES_CACHE_KEY, JSON.stringify(nodes));
    } catch {
        // Storage full or unavailable (e.g. private browsing) — caching is best-effort.
    }
}

export function clearCachedNodes() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(NODES_CACHE_KEY);
    } catch {
        // ignore
    }
}
