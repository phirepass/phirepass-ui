/**
 * An account in the workspace.
 *
 * The identity fields mirror the existing `users` table (see the schema in
 * README.md); `role` and `status` do not exist there yet — they are what this
 * surface is being built ahead of, alongside RBAC. See `src/lib/rbac.ts`.
 */

import type { Role } from '@/lib/rbac';

/**
 * `invited` is deliberately distinct from `active`: an invitation that was never
 * accepted is not a user who stopped showing up, and the two want different
 * actions (resend versus suspend).
 */
export type UserStatus = 'active' | 'invited' | 'suspended';

/** How the account authenticates. Drives the badge on the row. */
export type AuthProvider = 'github' | 'google' | 'password';

export interface WorkspaceUser {
    id: string;
    email: string;
    username: string;
    name: string | null;
    avatar_url: string | null;

    role: Role;
    status: UserStatus;
    provider: AuthProvider;
    mfa_enabled: boolean;

    created_at: string;
    /** `null` for an invitation that has not been accepted. */
    last_seen_at: string | null;
    /** Set only while `status === 'invited'`. */
    invited_at: string | null;

    /** What the account currently owns, so the cost of removing it is visible. */
    nodes_count: number;
    tokens_count: number;
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
    active: 'Active',
    invited: 'Invited',
    suspended: 'Suspended',
};

export const AUTH_PROVIDER_LABELS: Record<AuthProvider, string> = {
    github: 'GitHub',
    google: 'Google',
    password: 'Password',
};

export interface InviteUserInput {
    email: string;
    role: Role;
}
