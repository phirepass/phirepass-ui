import { TunnelNode } from "@/types/node";

export interface SharedNodeInfo {
    node: TunnelNode;
    sharedBy: string;
    sharedByEmail: string;
    sharedAt: string;
    expiresAt: string;
}

export const mockSharedNodes: SharedNodeInfo[] = [
    /*
    {
        node: {
            id: "shared-1",
            name: "External API Gateway",
            hostname: "api-gw-ext.partner.io",
            ip: "203.0.113.50",
            isOnline: true,
            lastSeen: "2024-01-15T10:30:00Z",
            stats: {
                cpu: 35,
                memory: 48,
                disk: 42,
                uptime: "45d 12h",
                ping: 28,
                networkIn: 890,
                networkOut: 1200,
                processes: 78,
                loadAvg: [0.8, 0.9, 0.7],
                temperature: 52,
                swapUsed: 12,
                openConnections: 245,
            },
            os: "Ubuntu 22.04",
            tags: ["api", "partner", "gateway"],
        },
        sharedBy: "Alice Johnson",
        sharedByEmail: "alice.johnson@partner.io",
        sharedAt: "2024-01-14T09:00:00Z",
        expiresAt: "2024-01-21T09:00:00Z",
    },
    {
        node: {
            id: "shared-2",
            name: "Staging Database",
            hostname: "db-staging.team.dev",
            ip: "10.50.100.25",
            isOnline: true,
            lastSeen: "2024-01-15T10:28:00Z",
            stats: {
                cpu: 22,
                memory: 65,
                disk: 58,
                uptime: "12d 8h",
                ping: 15,
                networkIn: 450,
                networkOut: 320,
                processes: 42,
                loadAvg: [0.4, 0.5, 0.4],
                temperature: 48,
                swapUsed: 8,
                openConnections: 89,
            },
            os: "Debian 12",
            tags: ["database", "staging", "postgresql"],
        },
        sharedBy: "Bob Smith",
        sharedByEmail: "bob.smith@company.com",
        sharedAt: "2024-01-13T14:30:00Z",
        expiresAt: "2024-01-20T14:30:00Z",
    },
    {
        node: {
            id: "shared-3",
            name: "ML Training Cluster",
            hostname: "ml-cluster-01.research.ai",
            ip: "172.20.50.100",
            isOnline: false,
            lastSeen: "2024-01-14T22:00:00Z",
            stats: {
                cpu: 0,
                memory: 0,
                disk: 75,
                uptime: "0d 0h",
                ping: 0,
                networkIn: 0,
                networkOut: 0,
                processes: 0,
                loadAvg: [0, 0, 0],
                temperature: 0,
                swapUsed: 0,
                openConnections: 0,
            },
            os: "Ubuntu 20.04 (CUDA)",
            tags: ["ml", "gpu", "research"],
        },
        sharedBy: "Dr. Chen Wei",
        sharedByEmail: "chen.wei@research.ai",
        sharedAt: "2024-01-10T08:00:00Z",
        expiresAt: "2024-02-10T08:00:00Z",
    },
    */
];
