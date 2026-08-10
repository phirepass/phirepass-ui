/**
 * A relay/server instance in the fleet.
 *
 * Mirrors what the Rust server already publishes about itself to
 * `phirepass:servers:{id}` — the `server` field (routing identity), `info`
 * (its `NodeInfo`, gathered once at startup) and `stats` (live counts) — so the
 * eventual API route is a projection of that hash rather than a new shape.
 */

import type { PublicIpLocation } from './geo';

/**
 * `stale` is its own state rather than a flavour of offline: the registry key
 * carries a 120s TTL refreshed by the server's keepalive, so an entry that
 * exists but has not been refreshed recently means "we heard from it, but not
 * lately" — which is a different operational problem from an instance that has
 * gone entirely.
 */
export type ServerStatus = 'online' | 'stale' | 'offline' | 'draining';

export interface ServerInstance {
    /** The `server_id` nodes and the relay route on. */
    id: string;
    fqdn: string;
    /** Address peers reach this instance on, discovered over STUN at startup. */
    public_ip: string;
    private_ip: string;
    port: number;
    version: string;

    status: ServerStatus;
    /** Epoch ms of the last keepalive write; `null` if never seen. */
    last_seen_at: number | null;
    started_at: number | null;

    /** Live counts from the keepalive payload. */
    nodes: number;
    connections: number;
    sessions: number;

    /** From the instance's own `NodeInfo` — host facts that cannot change. */
    host_name: string;
    host_os_info: string;
    /** Geolocation of the instance's public address, when the lookup resolved. */
    location: PublicIpLocation | null;

    /** Process metrics from the instance's last stats sample. */
    cpu_percent: number | null;
    mem_used_bytes: number | null;
    mem_total_bytes: number | null;
    load_average: [number, number, number] | null;
    uptime_secs: number | null;
}

export const SERVER_STATUS_LABELS: Record<ServerStatus, string> = {
    online: 'Online',
    stale: 'Stale',
    offline: 'Offline',
    draining: 'Draining',
};
