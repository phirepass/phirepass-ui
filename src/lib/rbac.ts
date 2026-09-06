/**
 * Roles, permissions, and the rules about who may act on whom.
 *
 * An **organisation** owns nodes, tokens and monitors; a **user holds a role in
 * it**. That is the whole model, and this module is the only description of it
 * — the same table answers for a button in the dashboard and for the guard on
 * the route behind that button (`src/app/lib/authz.ts` imports `can` from here
 * rather than restating it).
 *
 * Two properties are worth keeping while editing:
 *
 * - **It is pure and client-safe.** No database, no `next/headers`, no session.
 *   That is what lets the server import it, and what makes the whole table
 *   testable without a connection (`rbac.test.ts`).
 * - **It is not access control on its own.** A client can call whatever the API
 *   exposes regardless of what the buttons look like, so every gated route
 *   calls `requirePermission` server-side. The UI check exists so people are not
 *   shown affordances that will fail; the server check is what makes it true.
 *
 * The role names here are also the `CHECK` constraint on
 * `organization_members.role` (`migrations/001-organizations.ts`), so a role
 * this file does not know cannot be written, and `can()` never has to answer for
 * a value outside its own table.
 */

export type Role = 'owner' | 'admin' | 'member';

export type Permission =
    // Nodes. `:all` is the interesting one — every member can reach their own
    // nodes without a permission, so what this grants is reach across the
    // organisation.
    | 'nodes:read:all'
    | 'nodes:manage:all'
    // Monitors and tokens follow nodes: seeing every node in the organisation
    // and seeing only what is watching your own are different views of the
    // same page.
    | 'monitors:read:all'
    | 'tokens:read:all'
    // The organisation itself: its name, and who is in it.
    | 'org:read'
    | 'org:manage'
    | 'org:transfer'
    | 'servers:read'
    | 'servers:manage'
    | 'users:read'
    | 'users:manage'
    | 'users:invite'
    | 'pipelines:read'
    | 'pipelines:manage';

/**
 * Cumulative by convention: an owner can do everything an admin can. Spelled
 * out per role rather than layered, so reading one line answers the question.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
    owner: [
        'nodes:read:all', 'nodes:manage:all',
        'monitors:read:all', 'tokens:read:all',
        'org:read', 'org:manage', 'org:transfer',
        'servers:read', 'servers:manage',
        'users:read', 'users:manage', 'users:invite',
        'pipelines:read', 'pipelines:manage',
    ],
    // Everything an owner has except the two that decide who the owner is:
    // `org:transfer` hands the organisation to somebody else, and `org:manage`
    // renames the thing on the invoice. `users:manage` is granted, and bounded
    // by `canActOnMember` below rather than by its absence — an admin who could
    // not suspend a compromised member would have to wake the owner up.
    admin: [
        'nodes:read:all', 'nodes:manage:all',
        'monitors:read:all', 'tokens:read:all',
        'org:read',
        'servers:read', 'servers:manage',
        'users:read', 'users:manage', 'users:invite',
        'pipelines:read', 'pipelines:manage',
    ],
    // A member runs their own nodes. They see the organisation they are in and
    // the pipelines that touch their machines, and nothing that belongs to
    // somebody else.
    member: ['org:read', 'pipelines:read'],
};

export const ROLE_LABELS: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
    owner: 'Full control, including transferring ownership and removing admins.',
    admin: 'Reaches every node, manages members and servers, but cannot change owners.',
    member: 'Uses their own nodes and tokens; can read pipelines but not change them.',
};

/** Most privileged first — the order a member list reads in. */
export const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

export const ROLES: readonly Role[] = ['owner', 'admin', 'member'];

export function isRole(value: unknown): value is Role {
    return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Whether `actor` may change `target`'s membership at all — role, suspension or
 * removal.
 *
 * `can(role, 'users:manage')` answers "may this person administer members";
 * this answers "may they administer *this* member", which is the half that
 * stops an admin quietly demoting the owner who hired them. Both are required,
 * and both are checked on the route as well as in the UI.
 *
 * Acting on yourself is refused here rather than allowed and then special-cased
 * by every caller: a self-demotion is how the last owner disappears, and
 * "leave the organisation" is a different operation with a different question
 * attached to it.
 */
export function canActOnMember(actor: Role, target: Role, isSelf: boolean): boolean {
    if (isSelf) return false;
    if (!can(actor, 'users:manage')) return false;
    // Only an owner outranks an owner.
    if (target === 'owner') return actor === 'owner';
    return true;
}

/**
 * Whether `actor` may hand out `next` as a role.
 *
 * Separate from `canActOnMember` because the two constrain different ends of
 * the operation: one is about the person being changed, this is about what they
 * are being changed *into*. An admin may move somebody between admin and
 * member; making a second owner is `org:transfer`, and an owner's decision.
 */
export function canGrantRole(actor: Role, next: Role): boolean {
    if (next === 'owner') return can(actor, 'org:transfer');
    return can(actor, 'users:manage');
}

/**
 * `useCurrentRole()` used to live here, hardcoded to `owner` because the concept
 * did not exist. It now reads the session, which means it is a React hook with a
 * context behind it — and this module is imported by server code
 * (`src/app/lib/authz.ts`), which must not pull a client component in with it.
 *
 * So it moved: `import { useCurrentRole } from '@/lib/session'`. This file stays
 * pure, and remains the one description of the table.
 */
