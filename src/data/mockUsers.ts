import type { AuthProvider, InviteUserInput, UserStatus, WorkspaceUser } from '@/types/user';
import type { Role } from '@/lib/rbac';

/**
 * Sample accounts for the users dashboard. There is no API behind this page yet:
 * the `users` table exists, but `role` and `status` do not, so these records
 * describe the shape RBAC will need rather than anything currently stored.
 *
 * Timestamps derive from a `now` passed in by the caller so the set is built
 * once on mount instead of drifting per component.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface UserSpec {
    id: string;
    email: string;
    username: string;
    name: string | null;
    role: Role;
    status: UserStatus;
    provider: AuthProvider;
    mfa_enabled: boolean;
    createdDaysAgo: number;
    /** Hours since last activity; `null` for an unaccepted invitation. */
    lastSeenHoursAgo: number | null;
    invitedDaysAgo?: number;
    nodes_count: number;
    tokens_count: number;
}

/**
 * Deliberately covers every row state: the sole owner, admins, plain members,
 * an invitation still outstanding, a suspended account, and one member holding
 * enough resources that removing them is clearly not free.
 */
const SPECS: UserSpec[] = [
    {
        id: 'usr-01', email: 'dmouratidis153@gmail.com', username: 'dimitrmo',
        name: 'Dimitris Mouratidis', role: 'owner', status: 'active', provider: 'github',
        mfa_enabled: true, createdDaysAgo: 412, lastSeenHoursAgo: 0,
        nodes_count: 7, tokens_count: 3,
    },
    {
        id: 'usr-02', email: 'a.kovacs@example.com', username: 'akovacs',
        name: 'Anna Kovács', role: 'admin', status: 'active', provider: 'github',
        mfa_enabled: true, createdDaysAgo: 288, lastSeenHoursAgo: 2,
        nodes_count: 12, tokens_count: 4,
    },
    {
        id: 'usr-03', email: 'r.okafor@example.com', username: 'rokafor',
        name: 'Rachel Okafor', role: 'admin', status: 'active', provider: 'google',
        mfa_enabled: false, createdDaysAgo: 174, lastSeenHoursAgo: 19,
        nodes_count: 5, tokens_count: 2,
    },
    {
        id: 'usr-04', email: 'j.lindqvist@example.com', username: 'jlindqvist',
        name: 'Johan Lindqvist', role: 'member', status: 'active', provider: 'github',
        mfa_enabled: true, createdDaysAgo: 121, lastSeenHoursAgo: 6,
        nodes_count: 31, tokens_count: 6,
    },
    {
        id: 'usr-05', email: 'm.tanaka@example.com', username: 'mtanaka',
        name: 'Mika Tanaka', role: 'member', status: 'active', provider: 'password',
        mfa_enabled: false, createdDaysAgo: 88, lastSeenHoursAgo: 71,
        nodes_count: 2, tokens_count: 1,
    },
    {
        id: 'usr-06', email: 'p.novak@example.com', username: 'pnovak',
        name: null, role: 'member', status: 'invited', provider: 'password',
        mfa_enabled: false, createdDaysAgo: 6, lastSeenHoursAgo: null, invitedDaysAgo: 6,
        nodes_count: 0, tokens_count: 0,
    },
    {
        id: 'usr-07', email: 'l.fernandez@example.com', username: 'lfernandez',
        name: 'Lucía Fernández', role: 'member', status: 'suspended', provider: 'github',
        mfa_enabled: false, createdDaysAgo: 233, lastSeenHoursAgo: 1_440,
        nodes_count: 4, tokens_count: 2,
    },
];

function specToUser(spec: UserSpec, now: number): WorkspaceUser {
    return {
        id: spec.id,
        email: spec.email,
        username: spec.username,
        name: spec.name,
        avatar_url: null,
        role: spec.role,
        status: spec.status,
        provider: spec.provider,
        mfa_enabled: spec.mfa_enabled,
        created_at: new Date(now - spec.createdDaysAgo * DAY_MS).toISOString(),
        last_seen_at: spec.lastSeenHoursAgo === null
            ? null
            : new Date(now - spec.lastSeenHoursAgo * HOUR_MS).toISOString(),
        invited_at: spec.invitedDaysAgo === undefined
            ? null
            : new Date(now - spec.invitedDaysAgo * DAY_MS).toISOString(),
        nodes_count: spec.nodes_count,
        tokens_count: spec.tokens_count,
    };
}

export function createMockUsers(now: number = Date.now()): WorkspaceUser[] {
    return SPECS.map((spec) => specToUser(spec, now));
}

/** A freshly invited account: no activity, no resources, nothing accepted yet. */
export function createInvitedUser(input: InviteUserInput, now: number = Date.now()): WorkspaceUser {
    const username = input.email.split('@')[0] ?? input.email;

    return {
        id: `usr-${Math.random().toString(36).slice(2, 8)}`,
        email: input.email,
        username,
        name: null,
        avatar_url: null,
        role: input.role,
        status: 'invited',
        provider: 'password',
        mfa_enabled: false,
        created_at: new Date(now).toISOString(),
        last_seen_at: null,
        invited_at: new Date(now).toISOString(),
        nodes_count: 0,
        tokens_count: 0,
    };
}
