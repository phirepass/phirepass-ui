/**
 * How a node reads on Organisation → Downloads (screen L1), as pure rules.
 * Import-free so `policy-display.test.ts` runs under `node --test`.
 */

export type Policy = 'allowed' | 'links_only' | 'blocked';

export interface PolicyRow {
    id: string;
    name: string | null;
    owner_id: string;
    owner_username: string | null;
    owner_email: string | null;
    policy: Policy;
    changed_at: string | null;
    changed_by: string | null;
    changed_by_username: string | null;
    changed_by_email: string | null;
    downloads_on: boolean;
    running: number;
}

const person = (id: string | null, username: string | null, email: string | null, me: string | null) =>
    id !== null && id === me ? 'you' : username?.trim() || email?.split('@')[0] || 'a teammate';

const day = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "owner: you · 2 running", "blocked by you on 14 Nov", "… · Downloads switched off on the node". */
export function describePolicyRow(row: PolicyRow, me: string | null): string {
    const parts: string[] = [];
    if (row.policy !== 'allowed' && row.changed_at) {
        const verb = row.policy === 'blocked' ? 'blocked' : 'set to links only';
        parts.push(`${verb} by ${person(row.changed_by, row.changed_by_username, row.changed_by_email, me)} on ${day(row.changed_at)}`);
    } else {
        parts.push(`owner: ${person(row.owner_id, row.owner_username, row.owner_email, me)}`);
    }
    if (row.running > 0) {
        parts.push(`${row.running} running`);
    } else if (!row.downloads_on && row.policy !== 'blocked') {
        parts.push('Downloads switched off on the node');
    }
    return parts.join(' · ');
}

/**
 * Whether changing to `next` must ask first: tightening while downloads run,
 * because the server stops them. Links only stops torrents only, but the
 * page does not know which kind runs, so it asks for both.
 */
export function needsConfirmation(row: PolicyRow, next: Policy): boolean {
    const rank = { allowed: 0, links_only: 1, blocked: 2 } as const;
    return row.running > 0 && rank[next] > rank[row.policy];
}

export const POLICY_LABELS: Record<Policy, string> = {
    allowed: 'Allowed',
    links_only: 'Links only',
    blocked: 'Blocked',
};
