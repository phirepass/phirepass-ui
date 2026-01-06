export interface NodeStats {
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  ping: number;
  networkIn: number;  // KB/s
  networkOut: number; // KB/s
  processes: number;
  loadAvg: [number, number, number];
  temperature?: number;
  swapUsed: number;
  openConnections: number;
}

export interface TunnelNode {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  isOnline: boolean;
  lastSeen: string;
  stats: NodeStats;
  os: string;
  tags: string[];
}

export interface TerminalTab {
  id: string;
  nodeId: string;
  nodeName: string;
  isConnected: boolean;
  history: string[];
}

export interface FileItem {
  name: string;
  type: 'file' | 'directory';
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
  status: 'pending' | 'transferring' | 'completed' | 'failed';
}
