const DAY_MS = 24 * 60 * 60 * 1000;

/** Warn about a token this close to expiry, in days. */
export const TOKEN_EXPIRY_WARNING_DAYS = 14;

/** Days until `iso`; negative once it has passed, null when there is no date. */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return null;
    return Math.ceil((target - now) / DAY_MS);
}

export function formatAbsolute(iso: string | null | undefined): string {
    if (!iso) return 'Never';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
    const days = daysUntil(iso, now);
    if (days === null) return 'Never';
    if (days < 0) return `${Math.abs(days)}d ago`;
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days < 60) return `in ${days}d`;
    return `in ${Math.round(days / 30)}mo`;
}

export function formatAge(iso: string, now: number = Date.now()): string {
    const created = new Date(iso).getTime();
    if (!Number.isFinite(created)) return 'unknown';
    const days = Math.max(0, Math.floor((now - created) / DAY_MS));
    if (days === 0) return 'today';
    if (days === 1) return '1d ago';
    if (days < 60) return `${days}d ago`;
    return `${Math.round(days / 30)}mo ago`;
}

/**
 * Share of a token's configured lifetime already spent. Null when the token
 * never expires — there is no lifetime to spend, and drawing that as 0% would
 * imply a countdown that does not exist.
 */
export function lifetimeUsedPercent(
    createdAt: string,
    expiresAt: string | null | undefined,
    now: number = Date.now()
): number | null {
    if (!expiresAt) return null;
    const start = new Date(createdAt).getTime();
    const end = new Date(expiresAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}
