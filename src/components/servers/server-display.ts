import type { ServerInstance, ServerStatus } from '@/types/server';

/** Per-status colouring, written out in full because Tailwind cannot resolve
 *  class names assembled at runtime. */
export const SERVER_STATUS_STYLES: Record<ServerStatus, { dot: string; text: string; label: string }> = {
    online: { dot: 'bg-success', text: 'text-success', label: 'Online' },
    stale: { dot: 'bg-warning', text: 'text-warning', label: 'Stale' },
    draining: { dot: 'bg-info', text: 'text-info', label: 'Draining' },
    offline: { dot: 'bg-destructive', text: 'text-destructive', label: 'Offline' },
};

export function formatBytes(bytes: number | null): string {
    if (bytes === null) return '—';

    let size = bytes;
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let unit = units[0];

    for (const next of units.slice(1)) {
        if (size < 1024) break;
        size /= 1024;
        unit = next;
    }

    return `${size.toFixed(1)} ${unit}`;
}

export function formatUptime(seconds: number | null): string {
    if (seconds === null) return '—';

    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);

    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

export function formatRelativeTime(epochMs: number | null): string {
    if (epochMs === null) return 'never';

    const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/** Share of total memory in use, for the card's bar. */
export function memoryPercent(server: ServerInstance): number {
    if (!server.mem_total_bytes || server.mem_used_bytes === null) return 0;
    return Math.max(0, Math.min(100, (server.mem_used_bytes / server.mem_total_bytes) * 100));
}

/**
 * Instances that still carry traffic. `draining` counts: it is deliberately
 * still serving what it has, just not taking anything new.
 */
export function isServing(server: ServerInstance): boolean {
    return server.status === 'online' || server.status === 'draining';
}
