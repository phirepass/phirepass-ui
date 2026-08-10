import type { UserStatus, WorkspaceUser } from '@/types/user';

export const USER_STATUS_STYLES: Record<UserStatus, { dot: string; text: string; label: string }> = {
    active: { dot: 'bg-success', text: 'text-success', label: 'Active' },
    invited: { dot: 'bg-info', text: 'text-info', label: 'Invited' },
    suspended: { dot: 'bg-destructive', text: 'text-destructive', label: 'Suspended' },
};

export function displayName(user: WorkspaceUser): string {
    return user.name?.trim() || user.username;
}

/** Two letters for the avatar fallback, from the name when there is one. */
export function initials(user: WorkspaceUser): string {
    const source = user.name?.trim() || user.username;
    const parts = source.split(/[\s._-]+/).filter(Boolean);

    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
}

export function formatRelativeTime(iso: string | null): string {
    if (!iso) return 'never';

    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

export function formatDate(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString() : '—';
}

/**
 * An account that has been quiet for long enough to be worth reviewing. Ninety
 * days is the usual threshold for dormant-account cleanup, and a dormant account
 * that still holds nodes and tokens is the one worth surfacing.
 */
export function isDormant(user: WorkspaceUser): boolean {
    if (user.status !== 'active' || !user.last_seen_at) return false;
    const days = (Date.now() - new Date(user.last_seen_at).getTime()) / (24 * 60 * 60 * 1000);
    return days >= 90;
}
