export interface NodeStats {
    ip: string;
    host_connections: number;
    host_cpu: number;
    host_ip: string;
    host_load_average: [number, number, number];
    host_mac: string;
    host_mem_total_bytes: number;
    host_mem_used_bytes: number;
    host_name: string;
    host_os_info: string;
    host_processes: number;
    host_uptime_secs: number;
    last_refreshed_secs: number;
    proc_cpu: number;
    proc_id: string;
    proc_mem_bytes: number;
    proc_threads: number;
    proc_uptime_secs: number;
    version?: string;
}

export interface TunnelNode {
    connected_for_secs: number;
    id: string;
    ip: string;
    is_online: boolean;
    name: string;
    server_id: string;
    since_last_heartbeat_secs: number;
    stats: NodeStats;
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
