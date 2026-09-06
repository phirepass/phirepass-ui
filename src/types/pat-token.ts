export type PatTokenScope = 'server:register';

export type PatTokenStatus = 'active' | 'expired' | 'revoked';

export interface PatToken {
    id: string;
    /** Public half of the token, safe to display and to copy. */
    token_id: string;
    name: string;
    scopes: PatTokenScope[];
    created_at: string;
    expires_at?: string | null;
    /** Last successful agent auth with this token; null when never presented. */
    last_used_at?: string | null;
    status: PatTokenStatus;
    /**
     * Which member minted it. The list is org-scoped for anyone holding
     * `tokens:read:all`, so a row is no longer necessarily the reader's own and
     * the page needs this to say whose it is.
     */
    user_id: string;
    // No `node_count`. The list endpoint used to select a hardcoded `0` for it and
    // the UI printed that as fact. Counting enrolments per token needs the claim
    // path to record which token enrolled each node, which it does not — so the
    // field is absent rather than wrong. Add it back with the query that earns it.
}

export const AVAILABLE_SCOPES: {
    value: PatTokenScope;
    label: string;
    description: string;
}[] = [
    {
        value: 'server:register',
        label: 'Register a node',
        description: 'Lets an agent enrol itself with a server exactly once.',
    },
];

export const EXPIRY_OPTIONS = [
    { label: 'Never', value: 'never' },
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: '1 year', value: '365' },
];
