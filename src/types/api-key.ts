export interface ApiKey {
    id: string;
    name: string;
    key: string;
    prefix: string;
    createdAt: Date;
    lastUsedAt?: Date;
    expiresAt?: Date;
    scopes: ApiKeyScope[];
    status: "active" | "revoked";
}

export type ApiKeyScope =
    | "tunnels:read"
    | "tunnels:write"
    | "nodes:read"
    | "nodes:write"
    | "logs:read"
    | "api:full";
