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
    node_count: number;
    status: PatTokenStatus;
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
