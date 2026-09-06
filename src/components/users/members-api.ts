'use client';

/**
 * The members list, as the page talks to it.
 *
 * Every mutation answers with the whole refreshed list, so there is no local
 * patching of rows and no chance of the page and the database disagreeing about
 * who is an owner. That matters more here than on most surfaces: a role change
 * can move two rows at once (a transfer demotes the person who made it), and the
 * caller's own permissions can change as a result of what they just did.
 */

import type { Role } from '@/lib/rbac';
import type { OrgMember, OrgSummary } from '@/types/org';

export interface MembersResponse extends OrgSummary {
    members: OrgMember[];
    /** The signed-in account's user id, for "you" and the self-action guards. */
    self_id: string;
}

export class MembersApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'MembersApiError';
        this.status = status;
    }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
        credentials: 'include',
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
        ...init,
    });

    const body = await response.json().catch(() => null) as { error?: string } | null;

    if (!response.ok) {
        // The route's own message where there is one: it says *why* — "this is
        // the only owner", "you cannot change an owner" — and a generic string
        // here would throw that away.
        throw new MembersApiError(response.status, body?.error || 'Something went wrong');
    }

    return body as T;
}

export function fetchMembers(): Promise<MembersResponse> {
    return request<MembersResponse>('/api/org/members');
}

export function changeRole(userId: string, role: Role): Promise<{ members: OrgMember[] }> {
    return request(`/api/org/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
    });
}

export function setSuspended(userId: string, suspended: boolean): Promise<{ members: OrgMember[] }> {
    return request(`/api/org/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ suspended }),
    });
}

export function removeMember(userId: string): Promise<{
    removed: { email: string; nodes: number; tokens: number };
    members: OrgMember[];
}> {
    return request(`/api/org/members/${userId}`, { method: 'DELETE' });
}

export function inviteMember(email: string, role: Role): Promise<{
    invitation: { id: string; email: string; role: Role; expires_at: string };
    delivery: { sent: true; id: string | null } | { sent: false; reason: string };
    members: OrgMember[];
}> {
    return request('/api/org/invitations', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
    });
}

export function revokeInvitation(invitationId: string): Promise<{ members: OrgMember[] }> {
    return request(`/api/org/invitations/${invitationId}`, { method: 'DELETE' });
}
