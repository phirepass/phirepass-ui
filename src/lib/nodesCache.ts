import type { TunnelNode } from '@/types/node';

const NODES_CACHE_KEY = 'phirepass:nodes:cache';

/**
 * What is stored, and why it is no longer a bare array.
 *
 * The cache held `TunnelNode[]` under one key with nothing in it to say *whose*
 * nodes they were. An account can belong to several workspaces, switching one is
 * a full page load (`WorkspaceSwitcher`), and the first paint after that load is
 * seeded from here — so the previous workspace's machines, including ones that
 * had been shared with you *there*, came back on screen under the workspace you
 * had just moved to. The organisation travels with the nodes now, and a mismatch
 * is a cache miss.
 */
export interface NodesCacheEnvelope {
    /** The organisation these nodes were read under. */
    orgId: string | null;
    nodes: TunnelNode[];
}

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

/**
 * The nodes in an envelope, if it belongs to the organisation being asked about.
 *
 * Pure, and separate from the storage calls around it, so the rule can be tested
 * under the bare `node --test` runner without a browser — the same split as
 * `scope.ts` and `share-services.ts`, and for the same reason: a cache that
 * silently answers with the wrong tenant's rows is a mistake nothing else would
 * catch.
 *
 * `orgId` is `null` while `/api/profile` is still in flight, which is the first
 * render of every page. The envelope is accepted then — otherwise the cache
 * would never once be used and the instant paint it exists for would be gone —
 * and the page drops it the moment the profile resolves to a different
 * organisation.
 */
export function selectCachedNodes(
    envelope: NodesCacheEnvelope | null,
    orgId: string | null,
): TunnelNode[] | null {
    if (!envelope) {
        return null;
    }

    // An envelope from before this shape, or one written before the profile had
    // loaded, names no organisation and therefore cannot be shown to be the
    // right one.
    if (!envelope.orgId) {
        return null;
    }

    if (orgId !== null && envelope.orgId !== orgId) {
        return null;
    }

    return envelope.nodes;
}

export function readCachedEnvelope(): NodesCacheEnvelope | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(NODES_CACHE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;

        // A bare array is the pre-envelope shape. It is dropped rather than
        // adopted: there is no way to tell which workspace wrote it, which is
        // the whole problem the envelope fixes.
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        const envelope = parsed as Partial<NodesCacheEnvelope>;
        if (!Array.isArray(envelope.nodes)) {
            return null;
        }

        return {
            orgId: typeof envelope.orgId === 'string' ? envelope.orgId : null,
            nodes: envelope.nodes,
        };
    } catch {
        return null;
    }
}

/** The cached nodes for this organisation, or null when there are none to trust. */
export function getCachedNodes(orgId: string | null): TunnelNode[] | null {
    return selectCachedNodes(readCachedEnvelope(), orgId);
}

export function setCachedNodes(orgId: string | null, nodes: TunnelNode[]) {
    if (typeof window === 'undefined' || suspended) {
        return;
    }

    // Nothing is written until the session's organisation is known. An envelope
    // with a null `orgId` could not be matched against anything later, so it
    // would only ever be a cache miss taking up space.
    if (!orgId) {
        return;
    }

    try {
        const envelope: NodesCacheEnvelope = { orgId, nodes };
        window.localStorage.setItem(NODES_CACHE_KEY, JSON.stringify(envelope));
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
