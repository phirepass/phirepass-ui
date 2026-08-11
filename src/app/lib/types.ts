export type UserInfo = {
    id: string;
    username: string;
    password?: string | null;
    email: string;
    avatar_url: string;
    roles?: string[];
    accessToken?: string;
    created_at?: string;
    updated_at?: string;
    provider?: string;
}

export type PAToken = {
    id: string; // uuid
    token_id: string; // public identifier
    token_hash: string; // hashed token for verification
    user_id: string; // owner user id
    name: string; // token name given by user
    scopes: string[]; // permissions associated with the token
    created_at: string;
    expires_at?: string;
    last_used_at?: string | null; // last successful agent auth; null when never used
};

export type CreatePATInput = {
    name: string;
    user_id: string;
    scopes: string[];
    expires_at?: string | null;
};
