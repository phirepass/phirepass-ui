export interface TcpTunnel {
    id: string;
    name: string;
    protocol: "tcp" | "udp";
    localPort: number;
    localHost: string;
    remotePort: number;
    publicEndpoint: string;
    region: string;
    status: "active" | "inactive";
    createdAt: Date;
    lastActiveAt?: Date;
    bytesIn: number;
    bytesOut: number;
    connections: number;
}
