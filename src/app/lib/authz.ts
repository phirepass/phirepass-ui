/**
 * Server-side access control: who is calling, which organisation they are in,
 * and what they may reach inside it.
 *
 * `src/lib/rbac.ts` is the table of what each role may do; this module is where
 * that table is *enforced*, and it is the only place in this repo that resolves
 * a cookie into an organisation. Two things live here and nowhere else:
 *
 * 1. **`requireSession` / `requirePermission`** — every authenticated route
 *    starts with one of these instead of `verifyToken`, and gets back the
 *    caller's role along with their identity.
 *
 * 2. **`nodeScope`** — the single answer to "which nodes may this session see".
 *    Every node-shaped query in the app composes that fragment rather than
 *    writing its own `WHERE`. That is deliberate and it is the point of the
 *    module: node sharing (`phirepass-rs/SHARING.md`) becomes one `OR` added
 *    here, and every list, count and detail route inherits it at once.
 *
 * The old shape, for orientation: routes called `verifyToken()` and then wrote
 * `WHERE user_id = $1` by hand, in five places. A grantee's id does not appear
 * in that predicate and never could, which is why sharing needed this first.
 */

import { verifyToken } from './auth';
import { query } from './db';
import type { UserInfo } from './types';
import { can, isRole, type Permission, type Role } from '@/lib/rbac';
import { buildScope, renumber, type Scope, type ScopeShape } from './scope';
import type { MemberStatus } from '@/types/org';

/**
 * A request that has been authenticated *and* placed in an organisation.
 *
 * `orgId` is never null: `requireSession` bootstraps a personal organisation for
 * an account that somehow has none, so every downstream query can treat it as
 * present rather than branching. See `ensurePersonalOrg`.
 */
export interface Session {
    user: UserInfo;
    userId: string;
    orgId: string;
    role: Role;
    status: MemberStatus;
}

/**
 * An authorization failure with the status code it should become.
 *
 * Thrown rather than returned so a route body reads as a straight line —
 * `const session = await requirePermission('users:read')` — with one `catch` at
 * the bottom that turns whatever went wrong into a response. `respondToAuthzError`
 * is that catch.
 */
export class AuthzError extends Error {
    readonly status: number;
    /** What the client is told. Deliberately not `message`, which is for the log. */
    readonly publicMessage: string;

    constructor(status: number, publicMessage: string, message?: string) {
        super(message ?? publicMessage);
        this.name = 'AuthzError';
        this.status = status;
        this.publicMessage = publicMessage;
    }
}

/** The message thrown by `verifyToken` for each way a session can be absent. */
const UNAUTHENTICATED_MESSAGES = new Set([
    'Token not found',
    'Invalid token',
    'Invalid token payload',
    'User not found',
]);

/**
 * The one place a route turns a thrown error into a response.
 *
 * An `AuthzError` carries its own status; anything else is a bug or an outage
 * and becomes a 500 with nothing leaked. The `verifyToken` messages are mapped
 * too, so a route that still calls it directly behaves the same way.
 */
export function authzErrorStatus(error: unknown): { status: number; body: { error: string } } {
    if (error instanceof AuthzError) {
        return { status: error.status, body: { error: error.publicMessage } };
    }

    const message = error instanceof Error ? error.message : '';
    if (UNAUTHENTICATED_MESSAGES.has(message)) {
        return { status: 401, body: { error: 'Unauthorized' } };
    }

    return { status: 500, body: { error: 'Server error' } };
}

/**
 * Turn a username or email into something that satisfies the `slug` CHECK on
 * `organizations`: lowercase, `[a-z0-9-]`, starting on an alphanumeric.
 *
 * Mirrors the backfill in `migrations/001-organizations.ts` — the same account should get
 * the same slug whichever of the two reaches it first.
 */
export function slugCandidate(seed: string, fallbackId: string): string {
    const cleaned = seed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 55);

    if (!cleaned || !/^[a-z0-9]/.test(cleaned)) {
        return `org-${fallbackId.replace(/-/g, '').slice(0, 12)}`;
    }

    return cleaned;
}

/**
 * The organisation this account belongs to, creating a personal one if it is in
 * none.
 *
 * Called from the OAuth callback, so a new account has an organisation before
 * it has a session — and again from `requireSession` as a backstop, because an
 * account that reaches an authenticated route with no membership is a request
 * that cannot be answered at all, and the honest repair is to give it the
 * organisation the backfill would have.
 *
 * Idempotent and safe under concurrency: the membership insert is
 * `ON CONFLICT DO NOTHING` and the whole thing re-reads afterwards, so two
 * simultaneous first requests end with one organisation rather than two.
 * Returns the resolved membership.
 */
export async function ensurePersonalOrg(
    userId: string,
): Promise<{ orgId: string; role: Role; status: MemberStatus }> {
    const existing = await readMembership(userId);
    if (existing) return existing;

    const userResult = await query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [userId],
    );
    const account = userResult.rows[0] as { id: string; username: string | null; email: string } | undefined;
    if (!account) {
        throw new AuthzError(401, 'Unauthorized', 'User not found');
    }

    const displayName = (account.username?.trim() || account.email.split('@')[0] || 'Workspace').slice(0, 120);
    const base = slugCandidate(account.username?.trim() || account.email.split('@')[0] || '', account.id);

    // A slug collision is ordinary — two people called `dimitrmo` — so try a few
    // suffixes before falling back to something that cannot collide. The unique
    // index is the authority; this loop just makes the common case readable.
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = attempt === 0 ? base : `${base.slice(0, 55)}-${attempt + 1}`;

        try {
            const created = await query(
                `INSERT INTO organizations (name, slug, personal)
                 VALUES ($1, $2, true)
                 ON CONFLICT (slug) DO NOTHING
                 RETURNING id`,
                [displayName, slug],
            );

            if (created.rowCount === 0) continue;

            const orgId = (created.rows[0] as { id: string }).id;

            await query(
                `INSERT INTO organization_members (org_id, user_id, role, status)
                 VALUES ($1, $2, 'owner', 'active')
                 ON CONFLICT (org_id, user_id) DO NOTHING`,
                [orgId, userId],
            );

            await query(
                'UPDATE users SET primary_org_id = $1 WHERE id = $2 AND primary_org_id IS NULL',
                [orgId, userId],
            );

            // Everything this account already holds moves with it. Guarded on
            // NULL so a resource deliberately placed in another organisation is
            // never dragged back.
            await claimOrphanResources(userId, orgId);

            const resolved = await readMembership(userId);
            if (resolved) return resolved;
        } catch (error) {
            // A concurrent first request won the race and created the
            // membership under us; re-reading is the answer, not retrying.
            const resolved = await readMembership(userId);
            if (resolved) return resolved;
            throw error;
        }
    }

    // Both loops exhausted and still nothing: re-read once more before giving
    // up, in case a concurrent request finished between iterations.
    const resolved = await readMembership(userId);
    if (resolved) return resolved;

    throw new AuthzError(500, 'Server error', `could not place user ${userId} in an organisation`);
}

/**
 * Adopt the resources an account holds that are not in any organisation yet.
 *
 * The same statement the backfill runs, scoped to one user, for the accounts the
 * backfill has not reached — a node enrolled by an older `phirepass-rs` build,
 * or an account created after the migration ran. `monitors` is attempted
 * separately and tolerated missing, because the uptime schema is applied by hand
 * and a database without it must still be able to sign somebody in.
 */
async function claimOrphanResources(userId: string, orgId: string): Promise<void> {
    await query('UPDATE nodes SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL', [orgId, userId]);
    await query('UPDATE pat_tokens SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL', [orgId, userId]);

    try {
        await query('UPDATE monitors SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL', [orgId, userId]);
    } catch (error) {
        console.warn('[authz] monitors not org-scoped (table absent?):', error);
    }
}

/**
 * The membership a session runs under: the one named by `users.primary_org_id`,
 * or — if that is unset, or names an organisation this account is no longer in —
 * whichever they hold, most privileged first.
 *
 * Read from Postgres on every request rather than carried in the JWT, so a role
 * change, a suspension or a removal takes effect on the next request instead of
 * on the next sign-in. It is one indexed lookup on top of the one `verifyToken`
 * already does.
 */
async function readMembership(
    userId: string,
): Promise<{ orgId: string; role: Role; status: MemberStatus } | null> {
    const result = await query(
        `SELECT m.org_id, m.role, m.status
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.user_id = $1
         ORDER BY (m.org_id = u.primary_org_id) DESC,
                  (m.status = 'active') DESC,
                  (m.role = 'owner') DESC,
                  (m.role = 'admin') DESC,
                  m.joined_at ASC
         LIMIT 1`,
        [userId],
    );

    const row = result.rows[0] as { org_id: string; role: string; status: string } | undefined;
    if (!row) return null;

    // A role or status outside what this build knows is a database written by a
    // newer one. Refusing is the only safe reading: guessing downward would
    // silently strip access, guessing upward would grant it.
    if (!isRole(row.role)) {
        throw new AuthzError(500, 'Server error', `unknown role ${row.role} for user ${userId}`);
    }
    if (row.status !== 'active' && row.status !== 'suspended') {
        throw new AuthzError(500, 'Server error', `unknown member status ${row.status} for user ${userId}`);
    }

    return { orgId: row.org_id, role: row.role, status: row.status };
}

/**
 * The authenticated caller, placed in an organisation.
 *
 * Refuses a suspended member with 403 rather than 401: they are who they say
 * they are, and telling them their access was withdrawn is more useful than
 * bouncing them to a sign-in page that will succeed and land them here again.
 */
export async function requireSession(): Promise<Session> {
    const user = await verifyToken();
    const membership = await ensurePersonalOrg(user.id);

    if (membership.status === 'suspended') {
        throw new AuthzError(
            403,
            'Your access to this workspace has been suspended',
            `suspended member ${user.id} in org ${membership.orgId}`,
        );
    }

    return {
        user,
        userId: user.id,
        orgId: membership.orgId,
        role: membership.role,
        status: membership.status,
    };
}

/**
 * `requireSession`, and then the permission.
 *
 * This is the line `src/lib/rbac.ts` means when it says the same checks have to
 * be repeated server-side. A route that gates a button on `can(role, X)` gates
 * itself on `requirePermission(X)`, with the same constant, from the same table.
 */
export async function requirePermission(permission: Permission): Promise<Session> {
    const session = await requireSession();

    if (!can(session.role, permission)) {
        throw new AuthzError(
            403,
            'Forbidden',
            `role ${session.role} lacks ${permission} in org ${session.orgId}`,
        );
    }

    return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// Which resources a session may see
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **The** answer to "which nodes may this session see", as a predicate.
 *
 * The fragment itself is `buildScope` in `./scope.ts`, which is pure and tested
 * on its own; what lives here is the mapping from a session and a permission to
 * that fragment's inputs. Sharing (`phirepass-rs/SHARING.md`, roadmap A3) is one
 * `OR` added there, and every list, count, detail route and monitor target check
 * inherits it at once — which is why none of them write their own `WHERE`.
 *
 * @param alias the table alias the caller used for `nodes`
 */
export function nodeScope(session: Session, alias = 'n'): Scope {
    // `id`, because a node is shared through its own primary key. This is the
    // one scope that admits shares; see `nodeManageScope` for why it is the
    // only read scope that does.
    return buildScope(scopeShape(session, 'nodes:read:all'), alias, { style: 'leading' }, 'id');
}

/**
 * Which nodes this session may *change* — rename, delete, edit services.
 *
 * Narrower than `nodeScope` by exactly one permission, and separate from it
 * because reading and configuring are different rights: `SHARING.md` is explicit
 * that a grantee gets use of a node and the owner keeps its configuration, so
 * the two will diverge further, not less.
 */
export function nodeManageScope(session: Session, alias = 'n'): Scope {
    // No share arm, deliberately: being given a machine is being given its use.
    // Renaming it, deleting it, and editing its services stay with the owner and
    // with whoever reaches the whole organisation.
    return ownedScope(session, 'nodes:manage:all', alias);
}

/**
 * The same shape for rows that are owned but not shared — monitors and PAT
 * tokens. A token is a credential: `tokens:read:all` lets an administrator see
 * that one exists and revoke it, and no query anywhere returns its secret.
 */
export function ownedScope(session: Session, permission: Permission, alias: string): Scope {
    return buildScope(scopeShape(session, permission), alias, { style: 'leading' });
}

/**
 * The same predicate, for a query that already passes the caller's own user id
 * as `$1` and has `used` parameters in total.
 *
 * `scopeAt` renumbers a fragment to sit *before* a caller's parameters, which
 * means renumbering theirs too. This does the opposite: the fragment reuses the
 * `$1` that is already the caller's user id, and its two remaining values are
 * appended — so every existing placeholder in the query keeps the number it had.
 *
 * That is what made converting `src/app/lib/monitor.ts` a change to its `WHERE`
 * clauses rather than to every query in the file, and it is the right shape for
 * any hand-built query with a dynamic parameter list: build your conditions,
 * then append this one.
 */
export function scopeAppended(
    session: Session,
    permission: Permission,
    alias: string,
    used: number,
    sharedVia?: string,
): Scope {
    return buildScope(scopeShape(session, permission), alias, { style: 'appended', used }, sharedVia);
}

/**
 * Which monitors this session may see, shares included.
 *
 * A monitor follows its node: if somebody gave you a machine, the checks
 * watching that machine are part of what you were given — a shared node whose
 * uptime you cannot see is half a share. `monitors.node_id` is `NOT NULL`, so
 * there is always a node to follow.
 */
export function monitorScope(session: Session, alias = 'm'): Scope {
    return buildScope(scopeShape(session, 'monitors:read:all'), alias, { style: 'leading' }, 'node_id');
}

/**
 * Renumber a scope so it can sit after `offset` parameters of the caller's own.
 *
 * Written as a rewrite rather than by templating the numbers into each fragment
 * because the fragments are then readable on their own, and because a fragment
 * that hardcoded its offset would be usable in exactly one query.
 */
export function scopeAt(scope: Scope, offset: number): Scope {
    return { sql: renumber(scope.sql, offset), params: scope.params };
}

function scopeShape(session: Session, permission: Permission): ScopeShape {
    return {
        orgId: session.orgId,
        userId: session.userId,
        readsAll: can(session.role, permission),
    };
}
