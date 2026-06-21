import { TunnelNode } from '@/types/node';

const NODES_CACHE_KEY = 'phirepass:nodes:cache';

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
    if (typeof window === 'undefined') {
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
