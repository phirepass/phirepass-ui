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

/**
 * The services a share may name, as `ServiceKind` variant names.
 *
 * Uppercase because that is how `ServiceKind` serialises on the wire and how the
 * kind already arrives inside a node's `settings.services` — the same string in
 * the share row, the node record and the Rust enum, so nothing has to translate
 * between three spellings of "ssh".
 *
 * This list is the dashboard's copy of `common/src/protocol/settings.rs`, and it
 * is allowed to be *behind* it: a name a build does not know is dropped by
 * whoever reads it rather than refused, so a share written by a newer dashboard
 * loses one service on an older server instead of granting everything.
 */
export const SHAREABLE_SERVICES = ['SSH', 'SFTP', 'HTTP', 'RDP'] as const;

export type ShareableService = (typeof SHAREABLE_SERVICES)[number];

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

    /**
     * Which services this share opens.
     *
     * **Empty means every service**, including any added to the node later. That
     * is not the same as naming them all, and the difference is the reason the
     * dialog writes an explicit list: a machine that grows a new HTTP service
     * next month should not hand it to everyone who was lent its shell today.
     * Empty arrives from shares made before `006-share-scope`, and from someone
     * who deliberately asked for everything.
     */
    services: ShareableService[];

    /**
     * When this share stops granting anything, or null for no expiry.
     *
     * Read in the same predicate as `revoked_at` everywhere, because an expired
     * share and a withdrawn one grant the same thing.
     */
    expires_at: string | null;

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
