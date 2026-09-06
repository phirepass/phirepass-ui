/**
 * The organisation, as the browser sees it.
 *
 * Wire shapes only — the tables behind them are in
 * `src/app/lib/migrations/001-organizations.ts` and the rules about who may do
 * what are in `src/lib/rbac.ts`. Nothing here is a fixture: every field is
 * served by a route under `/api/org`.
 */

import type { Role } from '@/lib/rbac';

export interface Organization {
    id: string;
    name: string;
    slug: string;
    /** True for the organisation created automatically around a single account. */
    personal: boolean;
    created_at: string;
}

/**
 * Suspension is access removed without the row going away — the person keeps
 * their nodes, tokens and monitors, and reinstating them is one click. It is
 * enforced on the API, not only in the UI: a suspended member fails
 * `requireSession`.
 */
export type MemberStatus = 'active' | 'suspended';

/**
 * One row of the members list.
 *
 * The list is a union of two tables — people who are in the organisation
 * (`organization_members`) and addresses that were asked in and have not signed
 * in yet (`organization_invitations`) — because that is how an administrator
 * thinks about it. `kind` says which one a row came from, and it is what decides
 * whether the row's actions are "change role / suspend / remove" or "resend /
 * revoke".
 */
export type MemberKind = 'member' | 'invitation';

export interface OrgMember {
    /** The user id for a member, the invitation id for an invitation. */
    id: string;
    kind: MemberKind;

    email: string;
    /** Null for an invitation: nobody has told us their name yet. */
    username: string | null;
    name: string | null;
    avatar_url: string | null;

    role: Role;
    /** `invited` is not a `MemberStatus` — it is what `kind: 'invitation'` means. */
    status: MemberStatus | 'invited';

    /** How the account authenticates. Null for an invitation. */
    provider: string | null;
    mfa_enabled: boolean;

    /** When they joined, or when the invitation was sent. */
    created_at: string;
    /** Invitations only. */
    expires_at: string | null;

    /** What the account currently holds, so the cost of removing it is visible. */
    nodes_count: number;
    tokens_count: number;
}

export interface OrgSummary {
    org: Organization;
    /** The signed-in account's own role in it. */
    role: Role;
    member_count: number;
    invitation_count: number;
    owner_count: number;
}

export interface InviteMemberInput {
    email: string;
    role: Exclude<Role, 'owner'>;
}
