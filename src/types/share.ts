/**
 * Sharing a node, as the browser sees it.
 *
 * Wire shapes only — the table is in
 * `src/app/lib/migrations/005-node-shares.ts`, the rules are in
 * `src/app/lib/node-share.ts`, and who may read a shared node is the `OR` in
 * `src/app/lib/scope.ts`. Nothing here is a fixture: every field is served by
 * `/api/nodes/[nodeId]/shares`.
 */

import type { Role } from '@/lib/rbac';

/**
 * Who a share reaches.
 *
 * There are exactly two, and there is deliberately no third: a share cannot
 * name somebody outside the organisation the node belongs to. Anything wider
 * than `org` would be a public link, which is a different feature with a
 * different threat model.
 */
export type ShareAudience = 'org' | 'member';

export interface NodeShare {
    id: string;
    audience: ShareAudience;

    /** Null for an `org` share — it names no one because it names everyone. */
    grantee_id: string | null;
    grantee_email: string | null;
    grantee_username: string | null;
    grantee_avatar_url: string | null;

    /** Whoever shared it. Null if that account has since been deleted. */
    granted_by_username: string | null;
    granted_by_email: string | null;

    created_at: string;
}

/** Somebody in the workspace this node could still be shared with. */
export interface ShareCandidate {
    id: string;
    email: string;
    username: string | null;
    avatar_url: string | null;
    role: Role;
}

export interface SharesResponse {
    shares: NodeShare[];
    candidates: ShareCandidate[];
}
