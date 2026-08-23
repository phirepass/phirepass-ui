import type { PublicIpLocation } from './geo';

/**
 * Geolocation of the node's public address, resolved once by the agent at
 * login. An alias of the shared {@link PublicIpLocation}: uptime monitors carry
 * the same shape for the address they probe, and both render through the same
 * components.
 */
export type NodePublicIpInfo = PublicIpLocation;

/**
 * Identity of the LAN segment the node sits on, read by the agent from its own
 * routing table at login. Costs no network round trip, so unlike
 * {@link NodePublicIpInfo} it is present whenever the host has a default route.
 *
 * Every field is optional: a host may legitimately have no default route, and
 * agents built before the field existed send no `lan` at all.
 */
export interface NodeLanFingerprint {
    /** Default gateway's link-layer address, lowercase hex, colon separated. */
    gateway_mac?: string;
    gateway_ip?: string;
    /** The interface's network in CIDR form, e.g. `192.168.1.0/24`. */
    cidr?: string;
    /** Interface carrying the default route, e.g. `eth0`. */
    iface?: string;
    /** Whether the agent runs inside a container — explains a `172.17.x` local IP. */
    container?: boolean;
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
    lan?: NodeLanFingerprint | null;
    created_at?: number;
}

/**
 * The flat view the dashboard renders: live metrics from the agent's latest
 * heartbeat, merged with the static fields from {@link NodeInfo}.
 */
/** One mounted filesystem on the node, as reported with the heartbeat. */
export interface NodeFilesystem {
    /** Mount point — a path on unix, a drive root such as `C:\` on Windows. */
    mount: string;
    fs_type: string;
    total_bytes: number;
    /**
    * Free space the platform reports. Not `total - used`: on unix the two
    * differ by the root-reserved blocks, and this is the number that says
    * whether an ordinary service can still write.
    */
    available_bytes: number;
}

export interface NodeStats {
    ip: string;
    /** Open network connections on the host, sampled per heartbeat. */
    host_connections: number;
    host_cpu: number;
    /**
    * Real mounted filesystems, largest first, deduped and capped by the agent.
    *
    * Optional because nodes hydrate from `localStorage` before the first poll
    * lands (see `src/lib/nodesCache.ts`), so a cached node written before this
    * field existed has none — the same reason `monitor_count` is optional.
    * Absent and empty both mean "nothing to show", never "no disks".
    */
    host_disks?: NodeFilesystem[];
    host_disk_total_bytes?: number;
    host_disk_used_bytes?: number;
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
    /**
    * Uptime monitors that run their checks from this node. Optional so nodes
    * restored from an older local cache still typecheck; treat absent as
    * unknown rather than zero.
    */
    monitor_count?: number;
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
