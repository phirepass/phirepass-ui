/**
 * Reading and changing an organisation's membership.
 *
 * `authz.ts` answers "who is calling and what may they reach"; this module is
 * the organisation as a thing to administer — who is in it, who has been asked
 * in, and the invariants that keep it usable. The routes under `/api/org` are
 * thin over these functions, so the rules live in one testable place rather than
 * in five handlers.
 *
 * Three invariants are enforced here and not only in the UI:
 *
 * - **An organisation always has an owner.** The last one cannot be demoted,
 *   suspended or removed. Losing the last owner is unrecoverable without
 *   database access, which makes it the one mistake worth refusing outright.
 *   In practice this is a **backstop**: rank is checked first, and acting on an
 *   owner requires being one, while acting on yourself is refused — so reaching
 *   this guard needs two owners, which the API never produces (a transfer swaps
 *   the role, it does not add a second). It is here for the state a direct
 *   database edit, a restore, or a future multi-owner feature could create.
 * - **Nobody administers themselves.** Role changes, suspension and removal all
 *   refuse `isSelf`, so an owner cannot demote their way out of the invariant
 *   above by accident. Leaving is a separate, deliberate operation.
 * - **Rank is respected.** An admin may not touch an owner. `canActOnMember` in
 *   `src/lib/rbac.ts` is the rule; this module calls it.
 */

import crypto from 'node:crypto';

import { query } from './db';
import { AuthzError, type Session } from './authz';
import { canActOnMember, canGrantRole, isRole, type Role } from '@/lib/rbac';
import type { MemberStatus, Membership, OrgMember, OrgSummary, Organization } from '@/types/org';

/** Matches the CHECK on `organization_invitations.expires_at`'s default. */
const INVITATION_TTL_DAYS = 14;

/**
 * Shape check only, and deliberately loose. This is not the place to decide
 * whether an address exists — the invitation is claimed by whoever signs in with
 * it, so a typo produces an invitation nobody accepts rather than access granted
 * to the wrong person.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(value: unknown): string {
    if (typeof value !== 'string') {
        throw new AuthzError(400, 'An email address is required');
    }

    const email = value.trim().toLowerCase();

    if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
        throw new AuthzError(400, 'That does not look like an email address');
    }

    return email;
}

export function parseRole(value: unknown): Role {
    if (!isRole(value)) {
        throw new AuthzError(400, 'Unknown role');
    }
    return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrganization(orgId: string): Promise<Organization> {
    const result = await query(
        'SELECT id, name, slug, personal, created_at FROM organizations WHERE id = $1',
        [orgId],
    );

    const row = result.rows[0] as Organization | undefined;
    if (!row) {
        throw new AuthzError(404, 'Organisation not found', `org ${orgId} missing`);
    }

    return row;
}

export async function getOrgSummary(session: Session): Promise<OrgSummary> {
    const org = await getOrganization(session.orgId);

    const counts = await query(
        `SELECT
            (SELECT count(*)::int FROM organization_members WHERE org_id = $1)                       AS member_count,
            (SELECT count(*)::int FROM organization_members WHERE org_id = $1 AND role = 'owner')    AS owner_count,
            (SELECT count(*)::int FROM organization_invitations
              WHERE org_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
                AND expires_at > now())                                                              AS invitation_count`,
        [session.orgId],
    );

    const row = counts.rows[0] as { member_count: number; owner_count: number; invitation_count: number };

    return {
        org,
        role: session.role,
        member_count: row.member_count,
        owner_count: row.owner_count,
        invitation_count: row.invitation_count,
    };
}

/**
 * The members list: people in the organisation, then invitations still
 * outstanding.
 *
 * One query rather than two plus a merge in JavaScript, because the page sorts,
 * filters and pages across both kinds and a client-side union would have to
 * re-derive that ordering anyway. The counts are lateral subqueries against the
 * indexes added in `migrations/001-organizations.ts`, so the cost is per row on the page
 * rather than a scan.
 *
 * `mfa_enabled` reads `user_mfa`, which lives in a schema applied by hand
 * (`migrations/004-mfa.ts`) and may genuinely not exist. `to_regclass` guards it
 * inside SQL so a database without 2FA still lists members, reporting everyone
 * as unenrolled — which is the truth there.
 */
export async function listMembers(orgId: string): Promise<OrgMember[]> {
    const mfaJoin = await hasMfaTable()
        ? `EXISTS (SELECT 1 FROM user_mfa f WHERE f.user_id = u.id AND f.confirmed_at IS NOT NULL)`
        : `false`;

    const result = await query(
        `SELECT
            u.id::text                                   AS id,
            'member'                                     AS kind,
            u.email                                      AS email,
            u.username                                   AS username,
            u.avatar_url                                 AS avatar_url,
            m.role                                       AS role,
            m.status                                     AS status,
            u.provider                                   AS provider,
            ${mfaJoin}                                   AS mfa_enabled,
            m.joined_at                                  AS created_at,
            NULL::timestamptz                            AS expires_at,
            -- A sort key as a *column*, not an expression in the ORDER BY: a
            -- UNION may only be ordered by result column names, and an
            -- expression there is a hard parse error rather than a slow query.
            CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END AS role_rank,
            (SELECT count(*)::int FROM nodes n      WHERE n.org_id = m.org_id AND n.user_id = u.id) AS nodes_count,
            (SELECT count(*)::int FROM pat_tokens p WHERE p.org_id = m.org_id AND p.user_id = u.id) AS tokens_count
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1

         UNION ALL

         SELECT
            i.id::text                                   AS id,
            'invitation'                                 AS kind,
            i.email                                      AS email,
            NULL                                         AS username,
            NULL                                         AS avatar_url,
            i.role                                       AS role,
            'invited'                                    AS status,
            NULL                                         AS provider,
            false                                        AS mfa_enabled,
            i.created_at                                 AS created_at,
            i.expires_at                                 AS expires_at,
            CASE i.role WHEN 'admin' THEN 1 ELSE 2 END   AS role_rank,
            0                                            AS nodes_count,
            0                                            AS tokens_count
         FROM organization_invitations i
         WHERE i.org_id = $1
           AND i.accepted_at IS NULL
           AND i.revoked_at IS NULL
           AND i.expires_at > now()

         ORDER BY role_rank, kind, email`,
        [orgId],
    );

    return result.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        email: row.email,
        username: row.username,
        // `users` has no separate display name column; the username is the name.
        name: row.username,
        avatar_url: row.avatar_url,
        role: row.role,
        status: row.status,
        provider: row.provider,
        mfa_enabled: Boolean(row.mfa_enabled),
        created_at: row.created_at,
        expires_at: row.expires_at,
        nodes_count: row.nodes_count,
        tokens_count: row.tokens_count,
    })) as OrgMember[];
}

/**
 * Cached per process: `to_regclass` is cheap but this is asked on every member
 * list, and the answer only changes when somebody applies a schema file.
 */
let mfaTablePresent: boolean | null = null;

async function hasMfaTable(): Promise<boolean> {
    if (mfaTablePresent !== null) return mfaTablePresent;

    try {
        const result = await query("SELECT to_regclass('public.user_mfa') IS NOT NULL AS present");
        mfaTablePresent = Boolean((result.rows[0] as { present: boolean }).present);
    } catch (error) {
        console.warn('[org] could not probe user_mfa:', error);
        mfaTablePresent = false;
    }

    return mfaTablePresent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariants
// ─────────────────────────────────────────────────────────────────────────────

async function ownerCount(orgId: string): Promise<number> {
    const result = await query(
        "SELECT count(*)::int AS total FROM organization_members WHERE org_id = $1 AND role = 'owner' AND status = 'active'",
        [orgId],
    );
    return (result.rows[0] as { total: number }).total;
}

async function readMember(
    orgId: string,
    userId: string,
): Promise<{ role: Role; status: 'active' | 'suspended'; email: string } | null> {
    const result = await query(
        `SELECT m.role, m.status, u.email
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 AND m.user_id = $2`,
        [orgId, userId],
    );

    const row = result.rows[0] as { role: string; status: string; email: string } | undefined;
    if (!row) return null;
    if (!isRole(row.role)) {
        throw new AuthzError(500, 'Server error', `unknown role ${row.role}`);
    }

    return { role: row.role, status: row.status as 'active' | 'suspended', email: row.email };
}

/**
 * The guard every mutation below starts with: the target exists, the actor
 * outranks them, and it is not the actor themselves.
 */
async function requireActionableMember(session: Session, targetUserId: string) {
    const target = await readMember(session.orgId, targetUserId);

    if (!target) {
        throw new AuthzError(404, 'That person is not in this workspace');
    }

    if (!canActOnMember(session.role, target.role, session.userId === targetUserId)) {
        throw new AuthzError(
            403,
            session.userId === targetUserId
                ? 'You cannot change your own membership'
                : 'You cannot change an owner',
            `role ${session.role} may not act on ${target.role}`,
        );
    }

    return target;
}

/**
 * Refuse anything that would leave the organisation with no active owner.
 *
 * Checked before the write and, for the transfer case, as part of it — see the
 * transaction in `setMemberRole`.
 */
async function refuseLastOwnerLoss(orgId: string, targetRole: Role, what: string): Promise<void> {
    // Runs after `requireActionableMember`, so by here the actor outranks the
    // target and is not the target. See the note on backstops in the module
    // doc comment.
    if (targetRole !== 'owner') return;

    if (await ownerCount(orgId) <= 1) {
        throw new AuthzError(
            409,
            `This is the only owner — promote someone else before ${what}`,
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Change a member's role.
 *
 * Promoting somebody to owner is a transfer, not an addition: the actor steps
 * down to admin in the same transaction. Two owners by accident is how an
 * organisation ends up with a person nobody remembers granting; making it one
 * deliberate operation keeps the owner column meaning something. A second owner
 * on purpose is still reachable — promote, then have the new owner promote back
 * — which is a decision both people took part in.
 */
export async function setMemberRole(
    session: Session,
    targetUserId: string,
    nextRole: Role,
): Promise<void> {
    const target = await requireActionableMember(session, targetUserId);

    if (!canGrantRole(session.role, nextRole)) {
        throw new AuthzError(403, 'You cannot grant that role');
    }

    if (target.role === nextRole) return;

    await refuseLastOwnerLoss(session.orgId, target.role, 'changing their role');

    if (nextRole === 'owner') {
        // Both halves or neither. Written as one `UPDATE` rather than a
        // `BEGIN`/`COMMIT` pair on purpose: `src/app/lib/db.ts` holds a single
        // shared `Client` for the whole process, so an explicit transaction
        // spans every other request in flight at the same time. One statement is
        // atomic without borrowing the connection.
        //
        // An interrupted transfer would otherwise leave either two owners or
        // none, and "none" is unrecoverable without database access.
        await query(
            `UPDATE organization_members m
             SET role       = CASE WHEN m.user_id = $2 THEN 'owner'  ELSE 'admin' END,
                 status     = CASE WHEN m.user_id = $2 THEN 'active' ELSE m.status END,
                 updated_at = now()
             WHERE m.org_id = $1 AND m.user_id IN ($2, $3)`,
            [session.orgId, targetUserId, session.userId],
        );
        return;
    }

    await query(
        'UPDATE organization_members SET role = $3, updated_at = now() WHERE org_id = $1 AND user_id = $2',
        [session.orgId, targetUserId, nextRole],
    );
}

/**
 * Suspend or reinstate a member.
 *
 * Suspension takes effect on their next request — `requireSession` reads
 * membership from Postgres rather than from the JWT, so there is no window in
 * which a cookie issued a minute ago still works. A live WebSocket session is a
 * different matter and belongs to `phirepass-rs`; see the revocation sweep in
 * `SHARING.md`, which this will reuse.
 */
export async function setMemberSuspended(
    session: Session,
    targetUserId: string,
    suspended: boolean,
): Promise<void> {
    const target = await requireActionableMember(session, targetUserId);

    if (suspended) {
        await refuseLastOwnerLoss(session.orgId, target.role, 'suspending them');
    }

    await query(
        'UPDATE organization_members SET status = $3, updated_at = now() WHERE org_id = $1 AND user_id = $2',
        [session.orgId, targetUserId, suspended ? 'suspended' : 'active'],
    );
}

/**
 * Remove somebody from the organisation.
 *
 * Their resources do **not** leave with them. `nodes.org_id` is `ON DELETE
 * RESTRICT` against the organisation and untouched by this, so the nodes, tokens
 * and monitors they enrolled stay where they are and become visible to whoever
 * holds `nodes:read:all` — which is the behaviour a team wants when somebody
 * leaves. Returns what they were holding so the caller can say so.
 */
export async function removeMember(
    session: Session,
    targetUserId: string,
): Promise<{ email: string; nodes: number; tokens: number }> {
    const target = await requireActionableMember(session, targetUserId);
    await refuseLastOwnerLoss(session.orgId, target.role, 'removing them');

    const held = await query(
        `SELECT
            (SELECT count(*)::int FROM nodes      WHERE org_id = $1 AND user_id = $2) AS nodes,
            (SELECT count(*)::int FROM pat_tokens WHERE org_id = $1 AND user_id = $2) AS tokens`,
        [session.orgId, targetUserId],
    );
    const counts = held.rows[0] as { nodes: number; tokens: number };

    await query('DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2', [
        session.orgId,
        targetUserId,
    ]);

    // If that was their session's organisation, clear the pointer so their next
    // request resolves to whichever they still hold — or bootstraps a personal
    // one, which is the honest landing place for somebody with nowhere to be.
    await query('UPDATE users SET primary_org_id = NULL WHERE id = $1 AND primary_org_id = $2', [
        targetUserId,
        session.orgId,
    ]);

    return { email: target.email, nodes: counts.nodes, tokens: counts.tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Invitations
// ─────────────────────────────────────────────────────────────────────────────

function invitationToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

/**
 * Invite an address into the organisation.
 *
 * The invited person does not have to exist. Sign-in is OAuth, so the ordinary
 * case is an address with no `users` row at all, and the invitation is claimed
 * the first time somebody signs in with it (`claimInvitations`).
 *
 * An address that is *already* a member is refused rather than re-invited: the
 * caller almost certainly means to change their role, and silently doing nothing
 * would look like it worked.
 */
export async function inviteMember(
    session: Session,
    email: string,
    role: Role,
): Promise<{ id: string; email: string; role: Role; token: string; expires_at: string }> {
    if (role === 'owner') {
        throw new AuthzError(400, 'An invitation cannot grant ownership — transfer it instead');
    }

    if (!canGrantRole(session.role, role)) {
        throw new AuthzError(403, 'You cannot grant that role');
    }

    const already = await query(
        `SELECT 1 FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 AND lower(u.email) = $2`,
        [session.orgId, email],
    );

    if ((already.rowCount ?? 0) > 0) {
        throw new AuthzError(409, 'That person is already in this workspace');
    }

    const { token, hash } = invitationToken();

    // Re-inviting an address with an invitation outstanding is a resend: the
    // role is updated, the clock restarts and a fresh token is minted, which
    // also invalidates whatever link was sent before.
    const result = await query(
        `INSERT INTO organization_invitations (org_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
         ON CONFLICT (org_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL
         DO UPDATE SET role = EXCLUDED.role,
                       token_hash = EXCLUDED.token_hash,
                       invited_by = EXCLUDED.invited_by,
                       created_at = now(),
                       expires_at = EXCLUDED.expires_at
         RETURNING id, email, role, expires_at`,
        [session.orgId, email, role, hash, session.userId, String(INVITATION_TTL_DAYS)],
    );

    const row = result.rows[0] as { id: string; email: string; role: Role; expires_at: string };

    return { ...row, token };
}

export async function revokeInvitation(session: Session, invitationId: string): Promise<void> {
    const result = await query(
        `UPDATE organization_invitations
         SET revoked_at = now()
         WHERE id = $1 AND org_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
         RETURNING id`,
        [invitationId, session.orgId],
    );

    if (result.rowCount === 0) {
        throw new AuthzError(404, 'That invitation is no longer outstanding');
    }
}

/**
 * Turn every live invitation for this address into a membership.
 *
 * Called from the OAuth callback, once, on the account that just proved it holds
 * the address. That proof is the whole security of the flow — the invitation
 * link's token is a convenience for the person clicking it, not the thing that
 * grants access, which is why an invitation with no `token_hash` is still
 * claimable and why a leaked link cannot be used by a different address.
 *
 * `ON CONFLICT DO NOTHING` on the membership: somebody invited to an
 * organisation they are already in keeps the role they have. Returns the
 * organisations joined, so the caller can land them in one.
 */
export async function claimInvitations(userId: string, email: string): Promise<string[]> {
    const normalised = email.trim().toLowerCase();

    const pending = await query(
        `SELECT id, org_id, role
         FROM organization_invitations
         WHERE email = $1
           AND accepted_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > now()
         ORDER BY created_at ASC`,
        [normalised],
    );

    const joined: string[] = [];

    for (const row of pending.rows as { id: string; org_id: string; role: Role }[]) {
        await query(
            `INSERT INTO organization_members (org_id, user_id, role, status, invited_by)
             SELECT $1, $2, $3, 'active', i.invited_by
             FROM organization_invitations i WHERE i.id = $4
             ON CONFLICT (org_id, user_id) DO NOTHING`,
            [row.org_id, userId, row.role, row.id],
        );

        await query(
            `UPDATE organization_invitations
             SET accepted_at = now(), accepted_by = $2
             WHERE id = $1 AND accepted_at IS NULL`,
            [row.id, userId],
        );

        joined.push(row.org_id);
    }

    // Land them in the organisation they were invited to rather than in a
    // personal one they will never look at. Only when they have no active
    // membership already — being invited somewhere should not move a person who
    // is mid-way through work elsewhere.
    if (joined.length > 0) {
        await query(
            `UPDATE users u
             SET primary_org_id = $2
             WHERE u.id = $1
               AND (u.primary_org_id IS NULL
                    OR NOT EXISTS (SELECT 1 FROM organization_members m
                                   WHERE m.user_id = u.id AND m.org_id = u.primary_org_id))`,
            [userId, joined[0]],
        );
    }

    return joined;
}

/** Rename the organisation. `org:manage`, so owner only. */
export async function renameOrganization(session: Session, name: string): Promise<Organization> {
    const trimmed = name.trim();

    if (!trimmed || trimmed.length > 120) {
        throw new AuthzError(400, 'A workspace name must be between 1 and 120 characters');
    }

    const result = await query(
        `UPDATE organizations
         SET name = $2, personal = false, updated_at = now()
         WHERE id = $1
         RETURNING id, name, slug, personal, created_at`,
        [session.orgId, trimmed],
    );

    const row = result.rows[0] as Organization | undefined;
    if (!row) {
        throw new AuthzError(404, 'Organisation not found');
    }

    return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Belonging to more than one
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every workspace this account is a member of.
 *
 * Keyed on the user rather than on an organisation, which is what makes it the
 * one function here that is *not* scoped to `session.orgId`: it is asked
 * precisely by somebody who wants to leave the organisation they are currently
 * in. `listMembers` answers "who is in this workspace"; this answers "which
 * workspaces am I in", and the two are deliberately not the same query.
 *
 * Ordered personal-first and then by name, because the personal workspace is the
 * one every account has and the one people navigate back to by reflex — an
 * alphabetical list that buries it under a team is a list you have to read.
 */
export async function listMemberships(userId: string): Promise<Membership[]> {
    const result = await query(
        `SELECT o.id, o.name, o.slug, o.personal, o.created_at,
                m.role, m.status, m.joined_at,
                (SELECT count(*)::int FROM organization_members c WHERE c.org_id = o.id) AS member_count
         FROM organization_members m
         JOIN organizations o ON o.id = m.org_id
         WHERE m.user_id = $1
         ORDER BY o.personal DESC, lower(o.name) ASC, o.created_at ASC`,
        [userId],
    );

    return (result.rows as {
        id: string;
        name: string;
        slug: string;
        personal: boolean;
        created_at: string;
        role: string;
        status: string;
        joined_at: string;
        member_count: number;
    }[]).map((row) => {
        // Same reading as `readMembership`: a role or status this build does not
        // know is a database written by a newer one, and guessing either way is
        // worse than refusing.
        if (!isRole(row.role)) {
            throw new AuthzError(500, 'Server error', `unknown role ${row.role} for user ${userId}`);
        }
        if (row.status !== 'active' && row.status !== 'suspended') {
            throw new AuthzError(500, 'Server error', `unknown member status ${row.status} for user ${userId}`);
        }

        return {
            org: {
                id: row.id,
                name: row.name,
                slug: row.slug,
                personal: row.personal,
                created_at: row.created_at,
            },
            role: row.role,
            status: row.status as MemberStatus,
            member_count: row.member_count,
            joined_at: row.joined_at,
        };
    });
}

/** Organisation ids are uuids; anything else is a 400, not a query Postgres has to refuse. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Move this account's session into another workspace it belongs to.
 *
 * Writes `users.primary_org_id`, which is the first thing `readMembership`
 * sorts on — so the switch takes effect on the very next request, for every
 * device this account is signed in on, without reissuing the session cookie.
 * That is the point of keeping the organisation out of the JWT: it can change
 * without anybody signing in again.
 *
 * The membership check is inside the UPDATE rather than a read before it, so
 * two requests racing cannot land on a workspace the second one was removed
 * from in between. `status = 'active'` is part of it: a suspended member is
 * refused here rather than switched into a workspace whose every subsequent
 * request `requireSession` would answer 403.
 */
export async function setActiveOrganization(userId: string, orgId: unknown): Promise<Membership> {
    if (typeof orgId !== 'string' || !UUID_PATTERN.test(orgId)) {
        throw new AuthzError(400, 'A workspace is required');
    }

    const result = await query(
        `UPDATE users u
         SET primary_org_id = $2
         WHERE u.id = $1
           AND EXISTS (SELECT 1 FROM organization_members m
                       WHERE m.user_id = u.id AND m.org_id = $2 AND m.status = 'active')
         RETURNING u.primary_org_id`,
        [userId, orgId],
    );

    if (result.rowCount === 0) {
        // One message for "not a member" and for "suspended there". Which of the
        // two it is says something about the other workspace to somebody who is
        // not in it, and the switcher never offers either case anyway.
        throw new AuthzError(403, 'You do not have access to that workspace');
    }

    const membership = (await listMemberships(userId)).find((entry) => entry.org.id === orgId);
    if (!membership) {
        throw new AuthzError(500, 'Server error', `membership vanished for user ${userId} org ${orgId}`);
    }

    return membership;
}

/**
 * What opening an invitation link did.
 *
 * Every one of these lands the person in the dashboard — the outcome decides
 * what they are told when they get there, not whether they get there. That is
 * the whole point of the route: a link from an email should never dead-end on a
 * page about itself.
 */
export type AcceptOutcome =
    /** Joined, and the session now opens in that workspace. */
    | 'joined'
    /** Already a member — the callback claimed it by address moments ago, or they had joined before. Switched to it. */
    | 'switched'
    /** Signed in as somebody else. The invitation is untouched. */
    | 'mismatch'
    /** In that workspace, but suspended there. Not switched into it. */
    | 'suspended'
    /** Withdrawn by an administrator. */
    | 'revoked'
    /** Past `expires_at` and never accepted. */
    | 'expired'
    /** No such token — mistyped, superseded by a resend, or already used by another account. */
    | 'unknown';

export interface AcceptResult {
    outcome: AcceptOutcome;
    /** The workspace in question, where the token named one worth naming. */
    org: Organization | null;
}

/**
 * Accept an invitation from the link in the mail.
 *
 * **The token says which workspace; the address is still what grants the
 * membership.** A forwarded link is useless to anybody else — signing in as
 * someone the invitation was not addressed to gets `mismatch` and changes
 * nothing. That is the rule `inviteMember` was written under and this does not
 * relax it; what the token adds is knowing *which* invitation was opened, so
 * somebody who belongs to several workspaces lands in the right one instead of
 * wherever they happened to be last.
 *
 * The order of the checks matters. Membership is tested before expiry and
 * before `accepted_at`, because the ordinary signed-out path arrives here
 * having *already* been claimed: the OAuth callback claims by address on the
 * way through (`claimInvitations`), so by the time this runs the invitation is
 * accepted and the person is a member. Reporting that as "expired" would be a
 * lie told at the exact moment the thing worked.
 */
export async function acceptInvitation(
    userId: string,
    userEmail: string,
    token: unknown,
): Promise<AcceptResult> {
    if (typeof token !== 'string' || !token) {
        return { outcome: 'unknown', org: null };
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const found = await query(
        `SELECT i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at,
                o.id AS o_id, o.name, o.slug, o.personal, o.created_at
         FROM organization_invitations i
         JOIN organizations o ON o.id = i.org_id
         WHERE i.token_hash = $1`,
        [hash],
    );

    const row = found.rows[0] as {
        id: string;
        org_id: string;
        email: string;
        role: Role;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
        o_id: string;
        name: string;
        slug: string;
        personal: boolean;
        created_at: string;
    } | undefined;

    if (!row) return { outcome: 'unknown', org: null };

    const org: Organization = {
        id: row.o_id,
        name: row.name,
        slug: row.slug,
        personal: row.personal,
        created_at: row.created_at,
    };

    // Nothing below this line is said to somebody the invitation is not for.
    // The workspace name is not theirs to learn from a link they were forwarded.
    if (row.email !== userEmail.trim().toLowerCase()) {
        return { outcome: 'mismatch', org: null };
    }

    if (row.revoked_at) return { outcome: 'revoked', org };

    const existing = await query(
        'SELECT status FROM organization_members WHERE org_id = $1 AND user_id = $2',
        [row.org_id, userId],
    );
    const member = existing.rows[0] as { status: string } | undefined;

    if (member) {
        if (member.status === 'suspended') return { outcome: 'suspended', org };

        await query('UPDATE users SET primary_org_id = $2 WHERE id = $1', [userId, row.org_id]);
        return { outcome: 'switched', org };
    }

    if (row.accepted_at) return { outcome: 'unknown', org: null };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { outcome: 'expired', org };

    await query(
        `INSERT INTO organization_members (org_id, user_id, role, status, invited_by)
         SELECT $1, $2, $3, 'active', i.invited_by
         FROM organization_invitations i WHERE i.id = $4
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [row.org_id, userId, row.role, row.id],
    );

    await query(
        `UPDATE organization_invitations
         SET accepted_at = now(), accepted_by = $2
         WHERE id = $1 AND accepted_at IS NULL`,
        [row.id, userId],
    );

    // Unconditional, unlike the claim at sign-in: opening the link is somebody
    // saying "take me there", and landing them anywhere else is not an answer
    // to it.
    await query('UPDATE users SET primary_org_id = $2 WHERE id = $1', [userId, row.org_id]);

    return { outcome: 'joined', org };
}
