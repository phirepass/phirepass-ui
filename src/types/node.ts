/**
 * Geolocation of the node's public address, resolved once by the agent at
 * login. Everything past `ip` is optional — coverage differs per provider, and
 * a node with no egress reports no public info at all.
 */
export interface NodePublicIpInfo {
    ip: string;
    hostname?: string;
    continent?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
    time_zone?: string;
    asn?: string;
    asn_org?: string;
    is_proxy?: boolean;
}

/**
 * The half of a node's telemetry that cannot change while the agent runs. Sent
 * once with the agent's auth frame, so it is present even between heartbeats.
 * `null` for a node that has never connected.
 *
 * Its static fields are also merged into {@link NodeStats} for the components
 * that already read them there; use this type when you want the public address
 * or want to distinguish "never reported" from "reported as empty".
 */
export interface NodeInfo {
    proc_id?: string;
    version?: string;
    host_name?: string;
    host_ip?: string;
    host_local_ip?: string;
    host_mac?: string;
    host_os_info?: string;
    public?: NodePublicIpInfo | null;
    created_at?: number;
}

/**
 * The flat view the dashboard renders: live metrics from the agent's latest
 * heartbeat, merged with the static fields from {@link NodeInfo}.
 */
export interface NodeStats {
    ip: string;
    // host_connections: number; // unused by frontend
    host_cpu: number;
    host_ip: string;
    host_local_ip: string;
    host_load_average: [number, number, number];
    host_mac: string;
    host_mem_total_bytes: number;
    host_mem_used_bytes: number;
    host_name: string;
    host_os_info: string;
    host_processes: number;
    host_uptime_secs: number;
    // last_refreshed_secs: number; // unused by frontend
    // proc_cpu: number; // unused by frontend
    // proc_id: string; // unused by frontend
    // proc_mem_bytes: number; // unused by frontend
    // proc_threads: number; // unused by frontend
    // proc_uptime_secs: number; // unused by frontend
    version?: string;
}

/**
 * What the server could tell us about a node, which is not always a yes or a no:
 *
 * - `online`     — heartbeat seen; everything on the card is live.
 * - `connecting` — the agent authenticated but has not heartbeated yet, so its
 *                  metrics do not exist. Shown as still-resolving rather than
 *                  offline, because it is on its way up, not down.
 * - `offline`    — no registry entry at all.
 *
 * A fourth, purely client-side state exists before the first response of a page
 * load lands: see `NodeCard`'s `statusPending`.
 */
export type NodeStatus = 'online' | 'connecting' | 'offline';

export interface TunnelNode {
    connected_for_secs: number;
    id: string;
    ip: string;
    is_online: boolean;
    /** Optional so nodes restored from an older local cache still typecheck. */
    status?: NodeStatus;
    name: string;
    server_id: string;
    // since_last_heartbeat_secs: number; // unused by frontend
    stats: NodeStats;
    info?: NodeInfo | null;
    services: Record<string, number | { visibility: 'public' | 'private'; count: number }>;
}

export interface TerminalTab {
    id: string;
    nodeId: string;
    nodeName: string;
    isConnected: boolean;
    history: string[];
}

export interface FilePanelTab {
    id: string;
    nodeId: string;
    nodeName: string;
    serverId?: string;
    serviceId: string;
    serviceName?: string | null;
}

export interface RdpPanelTab {
    id: string;
    nodeId: string;
    nodeName: string;
    serverId?: string;
    serviceId: string;
    serviceName?: string | null;
    /**
     * `host:port` from the service settings. The agent dials from those same
     * settings, so this never affects routing — it is only what the browser
     * names in the CredSSP service principal, which some hosts check.
     */
    destination?: string;
}

export interface FileItem {
    name: string;
    type: "file" | "directory";
    size?: number;
    modified: string;
    permissions: string;
}

export interface FileTransfer {
    id: string;
    sourceNode: string;
    destNode: string;
    sourcePath: string;
    destPath: string;
    progress: number;
    status: "pending" | "transferring" | "completed" | "failed";
}
