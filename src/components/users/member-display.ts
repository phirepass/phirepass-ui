import type { Role } from '@/lib/rbac';
import type { OrgMember } from '@/types/org';

/**
 * Presentation for one row of the members list. No fixtures behind any of it —
 * every value comes from `GET /api/org/members`.
 */

export const STATUS_STYLES: Record<OrgMember['status'], { dot: string; text: string; label: string }> = {
    active: { dot: 'bg-success', text: 'text-success', label: 'Active' },
    invited: { dot: 'bg-info', text: 'text-info', label: 'Invited' },
    suspended: { dot: 'bg-destructive', text: 'text-destructive', label: 'Suspended' },
};

/**
 * Restrained on purpose: only the two roles that can reach every machine in the
 * workspace get a colour, because that is the thing worth spotting in a list of
 * fifty. A member is the ordinary case and reads as one.
 */
export const ROLE_STYLES: Record<Role, string> = {
    owner: 'text-violet',
    admin: 'text-accent',
    member: 'text-muted-foreground',
};

export function displayName(member: OrgMember): string {
    return member.name?.trim() || member.username?.trim() || member.email.split('@')[0];
}

/** Two letters for the avatar fallback, from the name when there is one. */
export function initials(member: OrgMember): string {
    const source = member.name?.trim() || member.username?.trim() || member.email;
    const parts = source.split(/[\s._@-]+/).filter(Boolean);

    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
}

export function formatRelativeTime(iso: string | null): string {
    if (!iso) return 'never';

    const delta = Date.now() - new Date(iso).getTime();
    const seconds = Math.round(Math.abs(delta) / 1000);
    const ago = delta >= 0;

    const say = (value: string) => (ago ? `${value} ago` : `in ${value}`);

    if (seconds < 60) return ago ? 'just now' : 'in a moment';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return say(`${minutes}m`);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return say(`${hours}h`);
    const days = Math.floor(hours / 24);
    if (days < 30) return say(`${days}d`);
    return say(`${Math.floor(days / 30)}mo`);
}

export function formatDate(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString() : '—';
}

/** What a row's second line says: when they joined, or when the invitation lapses. */
export function subtitle(member: OrgMember): string {
    if (member.kind === 'invitation') {
        return `Invited ${formatRelativeTime(member.created_at)} · expires ${formatRelativeTime(member.expires_at)}`;
    }

    return `Joined ${formatRelativeTime(member.created_at)}`;
}

/** How the account authenticates, as a label. `null` for an invitation. */
export function providerLabel(provider: string | null): string {
    if (!provider) return 'Not signed in yet';

    switch (provider) {
        case 'github': return 'GitHub';
        case 'google': return 'Google';
        case 'local': return 'Password';
        default: return provider;
    }
}

/**
 * An account with reach across the whole workspace and no second factor.
 *
 * The one thing on this page worth interrupting somebody about: a member with no
 * MFA can lose their own machines, an admin with no MFA can lose everybody's.
 */
export function isUnhardenedPrivilege(member: OrgMember): boolean {
    return member.kind === 'member'
        && member.status === 'active'
        && member.role !== 'member'
        && !member.mfa_enabled;
}
