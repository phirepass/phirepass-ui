/**
 * The seam role-based access control will land on.
 *
 * There is no RBAC yet: every account is effectively its own owner, and the
 * surfaces that will need it (server administration, user management) are
 * gated behind `IS_DEV_MODE` in the meantime. This module exists so those
 * surfaces are written against a permission check from the start — when roles
 * become real, only `useCurrentRole` has to change, rather than every button
 * that should have been asking.
 *
 * Like the dev gate, this is a **UI affordance, not access control**. A client
 * can call whatever the API exposes regardless of what the buttons look like,
 * so the same checks have to be repeated server-side when the routes are built.
 */

export type Role = 'owner' | 'admin' | 'member';

export type Permission =
    | 'servers:read'
    | 'servers:manage'
    | 'users:read'
    | 'users:manage'
    | 'users:invite';

/**
 * Cumulative by convention: an owner can do everything an admin can. Spelled
 * out per role rather than layered, so reading one line answers the question.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
    owner: ['servers:read', 'servers:manage', 'users:read', 'users:manage', 'users:invite'],
    admin: ['servers:read', 'servers:manage', 'users:read', 'users:invite'],
    member: [],
};

export const ROLE_LABELS: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
    owner: 'Full control, including transferring ownership and removing admins.',
    admin: 'Manages servers and invites users, but cannot change owners.',
    member: 'Uses their own nodes and tokens; sees nothing administrative.',
};

export function can(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * The signed-in account's role.
 *
 * Hardcoded to `owner` because the concept does not exist yet — the pages that
 * call this are dev-only, so the effect is confined to builds where every
 * surface is already visible. Replace with the role from the session once the
 * `users` table carries one.
 */
export function useCurrentRole(): Role {
    return 'owner';
}
