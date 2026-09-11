'use client';

/**
 * The workspaces this account belongs to, fetched once per browser session.
 *
 * It lived inside `WorkspaceSwitcher` while the switcher was the only thing that
 * needed it. The nodes page needs it too now — a node shared with you is only
 * visible from the workspace that owns it, so "there are two machines waiting
 * for you in another workspace" is a question about this list — and two modules
 * each holding their own copy is how the answer starts to disagree with itself.
 *
 * The in-flight promise is cached as well as the result, because several
 * consumers mount in the same tick and a result-only cache would still let them
 * all start a request.
 */

import type { Membership } from '@/types/org';
import { clearCachedNodes } from '@/lib/nodesCache';

let cached: Membership[] | null = null;
let inflight: Promise<Membership[]> | null = null;

export function loadWorkspaces(): Promise<Membership[]> {
    if (cached) return Promise.resolve(cached);
    if (inflight) return inflight;

    inflight = fetch('/api/org/workspaces', { credentials: 'include' })
        .then(async (res) => {
            if (!res.ok) throw new Error('Failed to load workspaces');
            const body = await res.json() as { workspaces?: Membership[] };
            cached = body.workspaces ?? [];
            return cached;
        })
        .finally(() => {
            inflight = null;
        });

    return inflight;
}

/** What the cache already holds, for a first render that should not flash. */
export function cachedWorkspaces(): Membership[] | null {
    return cached;
}

export function invalidateWorkspaces() {
    cached = null;
}

/**
 * Move the session into another workspace, and land on the node list there.
 *
 * One function, because there are two ways in — the header switcher, and the
 * notice on the nodes page that says where a share actually is — and a second
 * copy of this is a second chance to forget the cache.
 *
 * **A full load, not a client-side refresh.** Every list, count and permission
 * on screen belongs to the workspace being left, and there is no store to
 * invalidate centrally: pages fetch in their own effects, so `router.refresh()`
 * would leave a mounted list showing the old organisation's nodes. Landing on
 * `/dashboard/nodes` also avoids the sharper version of the same problem,
 * staying on a detail route for a node the new workspace cannot see.
 *
 * The node cache is cleared first. It is read on the first render of the nodes
 * page, before `/api/profile` has said which organisation this session is in, so
 * without this the reload paints the previous workspace's machines — shared ones
 * included — under the new one.
 */
export async function switchWorkspace(orgId: string): Promise<never> {
    const res = await fetch('/api/org/workspaces', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || 'Could not switch workspace');
    }

    invalidateWorkspaces();
    clearCachedNodes();

    window.location.assign('/dashboard/nodes');

    // The assignment above does not return control in practice; this keeps the
    // promise from resolving into a caller that would then re-enable its button.
    return new Promise<never>(() => undefined);
}
