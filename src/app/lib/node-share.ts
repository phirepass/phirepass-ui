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
import { LIVE_SHARE } from './scope';
import {
    SHAREABLE_SERVICES,
    type NodeShare,
    type ShareAudience,
    type ShareCandidate,
    type ShareableService,
} from '@/types/share';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The longest a share may be lent for.
 *
 * A ceiling rather than a default, and it exists so "expires" keeps meaning
 * something: a picker that offers a decade offers a share nobody will ever see
 * end, which is a share with no expiry wearing a date. Beyond this, say no
 * expiry and mean it — that at least shows up honestly in the list.
 */
const MAX_SHARE_DAYS = 365;

function requireUuid(value: unknown, what: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) {
        throw new AuthzError(400, `That is not a valid ${what}`);
    }
    return value;
}

/**
 * The services a share names, normalised, or `[]` for "every service".
 *
 * Refuses an unknown name rather than dropping it, which is the opposite of what
 * a *reader* does with one. The asymmetry is deliberate and it is the safe
 * direction of each: a writer who typed something this build does not understand
 * gets told, because the alternative is a share that silently grants less than
 * they asked for and a support conversation about why the shell does not open.
 * A reader drops it, because the alternative is a share written by a newer
 * dashboard that grants everything or nothing.
 *
 * Duplicates collapse and order is normalised so two requests that mean the same
 * thing store the same array — otherwise the row changes on every save and the
 * audit trail records edits nobody made.
 */
function normalizeServices(value: unknown): ShareableService[] {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new AuthzError(400, 'Services must be a list');
    }

    const known = new Set<string>(SHAREABLE_SERVICES);
    const chosen = new Set<ShareableService>();

    for (const entry of value) {
        if (typeof entry !== 'string') {
            throw new AuthzError(400, 'Services must be a list of service names');
        }

        const name = entry.trim().toUpperCase();
        if (!known.has(name)) {
            throw new AuthzError(400, `This workspace has no service called ${entry}`);
        }

        chosen.add(name as ShareableService);
    }

    // Naming every service and naming none reach the same place on purpose:
    // both mean "everything", and storing the empty array for both keeps one
    // representation of one meaning. The difference the column carries is about
    // services added *later*, and somebody who ticked every box has said they
    // want those too.
    if (chosen.size === SHAREABLE_SERVICES.length) {
        return [];
    }

    return SHAREABLE_SERVICES.filter((service) => chosen.has(service));
}

/**
 * When a share should stop granting, as an ISO string, or `null` for never.
 *
 * A date already in the past is refused rather than stored: it would be a row
 * that grants nothing from the moment it is written, and the person who wrote it
 * would see the share appear in the list and expect it to work.
 */
function normalizeExpiry(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw new AuthzError(400, 'An expiry must be a date');
    }

    const at = new Date(value);
    if (Number.isNaN(at.getTime())) {
        throw new AuthzError(400, 'That is not a date this can read');
    }

    const now = Date.now();
    if (at.getTime() <= now) {
        throw new AuthzError(400, 'That expiry has already passed');
    }

    if (at.getTime() - now > MAX_SHARE_DAYS * 24 * 60 * 60 * 1000) {
        throw new AuthzError(400, `A share can run for at most ${MAX_SHARE_DAYS} days`);
    }

    return at.toISOString();
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
        `SELECT s.id, s.audience, s.grantee_id, s.services, s.expires_at, s.created_at,
                u.email AS grantee_email, u.username AS grantee_username, u.avatar_url AS grantee_avatar_url,
                g.username AS granted_by_username, g.email AS granted_by_email
         FROM node_shares s
         LEFT JOIN users u ON u.id = s.grantee_id
         LEFT JOIN users g ON g.id = s.granted_by
         WHERE s.node_id = $1 AND s.org_id = $2 AND ${LIVE_SHARE}
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
                  AND s.audience = 'member' AND ${LIVE_SHARE})
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
 * Also the **edit** path, and deliberately the only one. Sharing again with the
 * same audience does not make a second grant — the two partial unique indexes
 * say so — it rewrites the one that exists, so changing which services a share
 * opens, or how long it runs, is the same request as making it. A separate PATCH
 * would be a second way to write the row, and the two would eventually disagree
 * about what a share is allowed to say.
 *
 * `ON CONFLICT … DO UPDATE`, not `DO NOTHING`, is what makes that true, and it
 * buys a second thing: an **expired** share is still `revoked_at IS NULL`, so it
 * still occupies its unique index even though nothing reads it any more. `DO
 * NOTHING` would silently refuse to re-lend a machine whose share ran out
 * yesterday. The update revives that row rather than leaving a corpse in the way
 * of the grant somebody just asked for.
 *
 * What the conflict does **not** bypass is the membership guard: a row that is
 * refused by the `WHERE EXISTS` below never reaches the index, so it never
 * conflicts and never updates.
 */
export async function createShare(
    session: Session,
    nodeId: string,
    audience: unknown,
    granteeId: unknown,
    services?: unknown,
    expiresAt?: unknown,
): Promise<{ shares: NodeShare[]; candidates: ShareCandidate[] }> {
    const id = requireUuid(nodeId, 'node id');
    const { orgId, ownerId } = await shareableNode(session, id);

    if (audience !== 'org' && audience !== 'member') {
        throw new AuthzError(400, 'A share is either with the workspace or with one member');
    }

    // Validated before either statement, so a malformed service name is a 400
    // that changed nothing rather than a 400 after a partial write.
    const chosen = normalizeServices(services);
    const expiry = normalizeExpiry(expiresAt);

    if ((audience as ShareAudience) === 'org') {
        await query(
            `INSERT INTO node_shares (node_id, org_id, audience, granted_by, services, expires_at)
             VALUES ($1, $2, 'org', $3, $4, $5)
             ON CONFLICT (node_id) WHERE audience = 'org' AND revoked_at IS NULL
             DO UPDATE SET services = EXCLUDED.services,
                           expires_at = EXCLUDED.expires_at,
                           granted_by = EXCLUDED.granted_by`,
            [id, orgId, session.userId, chosen, expiry],
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
    const written = await query(
        `INSERT INTO node_shares (node_id, org_id, audience, grantee_id, granted_by, services, expires_at)
         SELECT $1, $2, 'member', $3, $4, $5, $6
          WHERE EXISTS (SELECT 1 FROM organization_members m
                         WHERE m.org_id = $2 AND m.user_id = $3 AND m.status = 'active')
         ON CONFLICT (node_id, grantee_id) WHERE audience = 'member' AND revoked_at IS NULL
         DO UPDATE SET services = EXCLUDED.services,
                       expires_at = EXCLUDED.expires_at,
                       granted_by = EXCLUDED.granted_by
         RETURNING id`,
        [id, orgId, grantee, session.userId, chosen, expiry],
    );

    /*
     * Nothing written now means exactly one thing.
     *
     * It used to mean two — "already shared" or "not a member" — because the
     * conflict wrote nothing and returned nothing, and the two had to be told
     * apart by a second query that deliberately answered the same way to both:
     * confirming that an address belongs to a workspace the caller cannot
     * enumerate is itself an answer. `DO UPDATE` returns the row for every
     * member, conflict or not, so the only path left to zero rows is the
     * `WHERE EXISTS` above refusing a non-member — and that is the person the
     * refusal is for.
     */
    if (written.rowCount === 0) {
        throw new AuthzError(403, 'That person is not a member of this workspace');
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
