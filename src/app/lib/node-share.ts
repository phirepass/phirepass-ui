/**
 * Sharing a node with people you already work with.
 *
 * `authz.ts` answers "which nodes may this session see" — and since
 * `005-node-shares` that answer includes shared ones, through a single `OR` in
 * `scope.ts`. This module is the other half: making, listing and withdrawing
 * the rows that arm reads.
 *
 * Two invariants, enforced here and not only in the UI:
 *
 * - **A share never leaves the organisation.** The grantee must be an active
 *   member of the organisation the node belongs to, checked inside the INSERT
 *   rather than before it, so two racing requests cannot slip a share past a
 *   membership that is being removed. It is the third of three independent
 *   guards; the other two are the `org_id` column on the row and the org
 *   equality inside the read predicate.
 * - **Only somebody who could change the node may share it.** That is
 *   `nodeManageScope` — the node's owner, and whoever reaches the whole
 *   organisation. A grantee cannot re-share, which is the "no transitivity"
 *   answer `SHARING.md` proposed and this settles.
 *
 * What a share grants is *use*: the node appears in the list, its detail opens,
 * its monitors are visible, a session can be opened against it. It grants
 * nothing else — renaming, deleting, editing services and reading service
 * credentials all stay on `nodeManageScope`, which has no share arm.
 */

import { query } from './db';
import { AuthzError, nodeManageScope, scopeAt, type Session } from './authz';
import type { NodeShare, ShareAudience, ShareCandidate } from '@/types/share';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, what: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) {
        throw new AuthzError(400, `That is not a valid ${what}`);
    }
    return value;
}

/**
 * The node, if this session may share it.
 *
 * Returns its organisation, because every subsequent statement is scoped to it:
 * a share belongs to the node's organisation, not to whichever one the sharer
 * happens to be looking at. They are the same today — `nodeManageScope` already
 * required it — and writing it from the node keeps it true if that ever changes.
 */
async function shareableNode(session: Session, nodeId: string): Promise<{ orgId: string; ownerId: string }> {
    const scope = scopeAt(nodeManageScope(session, 'n'), 1);

    const result = await query(
        `SELECT n.org_id, n.user_id FROM nodes n WHERE n.id = $1 AND ${scope.sql}`,
        [nodeId, ...scope.params],
    );

    const row = result.rows[0] as { org_id: string | null; user_id: string } | undefined;

    // 404 rather than 403 for a node this session cannot change: the same answer
    // the rest of `/api/nodes` gives, and it does not confirm the id exists.
    if (!row) {
        throw new AuthzError(404, 'Node not found');
    }

    // An unclaimed node — one the organisation backfill has not reached — has
    // nobody to share it with. Refusing is better than inventing an
    // organisation for the row, which is what the NULL arm of the predicate is
    // deliberately not for.
    if (!row.org_id) {
        throw new AuthzError(409, 'This node is not in a workspace yet, so it cannot be shared');
    }

    return { orgId: row.org_id, ownerId: row.user_id };
}

/** Who this node is shared with, and who else it could be shared with. */
export async function listShares(
    session: Session,
    nodeId: string,
): Promise<{ shares: NodeShare[]; candidates: ShareCandidate[] }> {
    const id = requireUuid(nodeId, 'node id');
    const { orgId, ownerId } = await shareableNode(session, id);

    const shares = await query(
        `SELECT s.id, s.audience, s.grantee_id, s.created_at,
                u.email AS grantee_email, u.username AS grantee_username, u.avatar_url AS grantee_avatar_url,
                g.username AS granted_by_username, g.email AS granted_by_email
         FROM node_shares s
         LEFT JOIN users u ON u.id = s.grantee_id
         LEFT JOIN users g ON g.id = s.granted_by
         WHERE s.node_id = $1 AND s.org_id = $2 AND s.revoked_at IS NULL
         ORDER BY (s.audience = 'org') DESC, lower(coalesce(u.username, u.email)) ASC`,
        [id, orgId],
    );

    /*
     * Everyone who could be named, minus everyone already named — and minus the
     * owner, who cannot be given what they already have.
     *
     * Suspended members are excluded rather than listed as unavailable: a
     * suspended member fails `requireSession` outright, so a share for one is a
     * row that grants nothing and would have to be explained.
     */
    const candidates = await query(
        `SELECT u.id, u.email, u.username, u.avatar_url, m.role
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1
           AND m.status = 'active'
           AND u.id <> $2
           AND NOT EXISTS (
               SELECT 1 FROM node_shares s
                WHERE s.node_id = $3 AND s.grantee_id = u.id
                  AND s.audience = 'member' AND s.revoked_at IS NULL)
         ORDER BY lower(coalesce(u.username, u.email)) ASC`,
        [orgId, ownerId, id],
    );

    return {
        shares: shares.rows as NodeShare[],
        candidates: candidates.rows as ShareCandidate[],
    };
}

/**
 * Share the node with the whole organisation, or with one person in it.
 *
 * Idempotent by way of the two partial unique indexes: sharing twice is the
 * same share, so a double-clicked button updates nothing and answers with the
 * list rather than a conflict.
 */
export async function createShare(
    session: Session,
    nodeId: string,
    audience: unknown,
    granteeId: unknown,
): Promise<{ shares: NodeShare[]; candidates: ShareCandidate[] }> {
    const id = requireUuid(nodeId, 'node id');
    const { orgId, ownerId } = await shareableNode(session, id);

    if (audience !== 'org' && audience !== 'member') {
        throw new AuthzError(400, 'A share is either with the workspace or with one member');
    }

    if ((audience as ShareAudience) === 'org') {
        await query(
            `INSERT INTO node_shares (node_id, org_id, audience, granted_by)
             VALUES ($1, $2, 'org', $3)
             ON CONFLICT DO NOTHING`,
            [id, orgId, session.userId],
        );

        return listShares(session, id);
    }

    const grantee = requireUuid(granteeId, 'member id');

    if (grantee === ownerId) {
        throw new AuthzError(409, 'That is the owner of this node');
    }

    /*
     * The membership test lives inside the INSERT.
     *
     * `SELECT` … `WHERE EXISTS` rather than `VALUES`, so the row is written only
     * if the grantee is an active member of this node's organisation at the
     * moment of writing. A check made before the insert would leave a window in
     * which a membership is removed and a share is created anyway — small, but
     * this is the guard that keeps a node inside its tenant.
     */
    const inserted = await query(
        `INSERT INTO node_shares (node_id, org_id, audience, grantee_id, granted_by)
         SELECT $1, $2, 'member', $3, $4
          WHERE EXISTS (SELECT 1 FROM organization_members m
                         WHERE m.org_id = $2 AND m.user_id = $3 AND m.status = 'active')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [id, orgId, grantee, session.userId],
    );

    /*
     * Nothing written is either "already shared" or "not a member of this
     * workspace", and those must not be told apart by a caller: the second
     * would confirm whether an address belongs to an organisation the caller
     * cannot otherwise enumerate. So the already-shared case is resolved by
     * asking, and only a genuine non-member reaches the refusal.
     */
    if (inserted.rowCount === 0) {
        const live = await query(
            `SELECT 1 FROM node_shares
              WHERE node_id = $1 AND grantee_id = $2 AND audience = 'member' AND revoked_at IS NULL`,
            [id, grantee],
        );

        if (live.rowCount === 0) {
            throw new AuthzError(403, 'That person is not a member of this workspace');
        }
    }

    return listShares(session, id);
}

/**
 * Withdraw a share.
 *
 * `revoked_at`, not `DELETE`: who could reach a machine, and when, is the
 * question this feature exists to answer, and a deleted row answers nothing.
 * The read predicate tests `revoked_at IS NULL` on every read, so the next
 * request from the person who lost it already fails — what is *not* closed by
 * this is a session they have open right now. That sweep is the server's, and
 * it is the piece `SHARING.md` calls out as still to build.
 */
export async function revokeShare(
    session: Session,
    nodeId: string,
    shareId: string,
): Promise<{ shares: NodeShare[]; candidates: ShareCandidate[] }> {
    const id = requireUuid(nodeId, 'node id');
    const share = requireUuid(shareId, 'share id');

    const { orgId } = await shareableNode(session, id);

    const result = await query(
        `UPDATE node_shares
            SET revoked_at = now()
          WHERE id = $1 AND node_id = $2 AND org_id = $3 AND revoked_at IS NULL
      RETURNING id`,
        [share, id, orgId],
    );

    if (result.rowCount === 0) {
        throw new AuthzError(404, 'That share is not there to withdraw');
    }

    return listShares(session, id);
}
