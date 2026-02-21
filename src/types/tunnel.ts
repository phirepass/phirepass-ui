export interface RequestLog {
    id: string;
    timestamp: Date;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
    path: string;
    statusCode: number;
    duration: number;
    size: number;
    userAgent?: string;
    ip?: string;
}

export interface Tunnel {
    id: string;
    name: string;
    localPort: number;
    localHost: string;
    publicUrl: string;
    region: string;
    status: "active" | "inactive";
    createdAt: Date;
    lastActiveAt?: Date;
    requestCount: number;
    bytesIn: number;
    bytesOut: number;
    requestLogs: RequestLog[];
}
