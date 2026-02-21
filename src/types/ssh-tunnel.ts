export interface SshTunnel {
    id: string;
    name: string;
    nodeId: string;
    nodeName: string;
    nodeIp: string;
    localPort: number;
    remotePort: number;
    status: "active" | "inactive";
    createdAt: string;
    lastConnected: string;
    bytesIn: number;
    bytesOut: number;
    sessions: number;
}
