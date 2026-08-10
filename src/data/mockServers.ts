import type { PublicIpLocation } from '@/types/geo';
import type { ServerInstance, ServerStatus } from '@/types/server';

/**
 * Sample fleet for the servers dashboard. There is no API behind this page yet —
 * the real source is the `phirepass:servers:*` registry the Rust server writes
 * on every keepalive, so these records are shaped exactly like a projection of
 * that hash.
 *
 * Values are derived from a `now` passed in by the caller so the whole set can
 * be built once on mount rather than drifting per component.
 */

const MINUTE_MS = 60 * 1000;

const LOCATIONS = {
    frankfurt: {
        ip: '138.201.44.9', city: 'Frankfurt', region: 'Hesse', country: 'Germany',
        country_code: 'DE', continent: 'Europe', latitude: 50.1109, longitude: 8.6821,
        time_zone: 'Europe/Berlin', asn: 'AS24940', asn_org: 'Hetzner Online GmbH',
    },
    ashburn: {
        ip: '54.85.19.203', city: 'Ashburn', region: 'Virginia', country: 'United States',
        country_code: 'US', continent: 'North America', latitude: 39.0438, longitude: -77.4874,
        time_zone: 'America/New_York', asn: 'AS14618', asn_org: 'Amazon.com, Inc.',
    },
    singapore: {
        ip: '13.228.90.51', city: 'Singapore', region: 'Singapore', country: 'Singapore',
        country_code: 'SG', continent: 'Asia', latitude: 1.3521, longitude: 103.8198,
        time_zone: 'Asia/Singapore', asn: 'AS16509', asn_org: 'Amazon Data Services',
    },
    saopaulo: {
        ip: '18.230.11.77', city: 'São Paulo', region: 'São Paulo', country: 'Brazil',
        country_code: 'BR', continent: 'South America', latitude: -23.5505, longitude: -46.6333,
        time_zone: 'America/Sao_Paulo', asn: 'AS16509', asn_org: 'Amazon Data Services',
    },
} satisfies Record<string, PublicIpLocation>;

interface ServerSpec {
    id: string;
    fqdn: string;
    location: keyof typeof LOCATIONS | null;
    private_ip: string;
    version: string;
    status: ServerStatus;
    nodes: number;
    connections: number;
    sessions: number;
    host_name: string;
    host_os_info: string;
    /** Minutes since the last keepalive; `null` for an instance that is gone. */
    lastSeenMinutesAgo: number | null;
    uptimeHours: number | null;
    cpu: number | null;
    memUsedGb: number | null;
    memTotalGb: number | null;
    load: [number, number, number] | null;
}

/**
 * Spread across every state the page renders: healthy, busy, lagging its
 * keepalive, drained for maintenance, one version behind, and gone entirely.
 */
const SPECS: ServerSpec[] = [
    {
        id: '4f2c7a10-0f1e-4c3b-9a71-2b8c5d9e1a44',
        fqdn: 'eu-central-1.phirepass.com',
        location: 'frankfurt',
        private_ip: '10.0.1.14',
        version: '0.1.307',
        status: 'online',
        nodes: 148, connections: 312, sessions: 47,
        host_name: 'phire-eu-1',
        host_os_info: 'Debian 13.1.0 [64-bit]',
        lastSeenMinutesAgo: 0,
        uptimeHours: 742,
        cpu: 18.4, memUsedGb: 3.1, memTotalGb: 16,
        load: [0.62, 0.55, 0.48],
    },
    {
        id: '9b1d3e55-77aa-4f02-8c6e-1d4a7b2f9c03',
        fqdn: 'us-east-1.phirepass.com',
        location: 'ashburn',
        private_ip: '10.0.2.21',
        version: '0.1.307',
        status: 'online',
        nodes: 274, connections: 588, sessions: 96,
        host_name: 'phire-us-1',
        host_os_info: 'Debian 13.1.0 [64-bit]',
        lastSeenMinutesAgo: 0,
        uptimeHours: 512,
        cpu: 46.9, memUsedGb: 7.8, memTotalGb: 16,
        load: [1.84, 1.62, 1.41],
    },
    {
        id: 'c7e0a982-31bb-4d19-a5f7-6e2c8d0b3a15',
        fqdn: 'ap-southeast-1.phirepass.com',
        location: 'singapore',
        private_ip: '10.0.3.8',
        version: '0.1.306',
        status: 'stale',
        nodes: 61, connections: 118, sessions: 12,
        host_name: 'phire-ap-1',
        host_os_info: 'Debian 13.1.0 [64-bit]',
        lastSeenMinutesAgo: 4,
        uptimeHours: 1290,
        cpu: 11.2, memUsedGb: 2.4, memTotalGb: 8,
        load: [0.31, 0.29, 0.33],
    },
    {
        id: '2a5f8c31-9e44-4a7d-b0c2-8f1e6d3a9b57',
        fqdn: 'sa-east-1.phirepass.com',
        location: 'saopaulo',
        private_ip: '10.0.4.5',
        version: '0.1.307',
        status: 'draining',
        nodes: 9, connections: 14, sessions: 2,
        host_name: 'phire-sa-1',
        host_os_info: 'Debian 13.1.0 [64-bit]',
        lastSeenMinutesAgo: 0,
        uptimeHours: 96,
        cpu: 4.1, memUsedGb: 1.2, memTotalGb: 8,
        load: [0.08, 0.11, 0.15],
    },
    {
        id: 'e83b6d47-5c12-4b88-9f30-7a2d5e1c4b96',
        fqdn: 'eu-west-1.phirepass.com',
        location: null,
        private_ip: '10.0.5.11',
        version: '0.1.304',
        status: 'offline',
        nodes: 0, connections: 0, sessions: 0,
        host_name: 'phire-eu-2',
        host_os_info: 'Debian 12.8.0 [64-bit]',
        lastSeenMinutesAgo: 186,
        uptimeHours: null,
        cpu: null, memUsedGb: null, memTotalGb: null,
        load: null,
    },
];

const GB = 1024 * 1024 * 1024;

export function createMockServers(now: number = Date.now()): ServerInstance[] {
    return SPECS.map((spec) => ({
        id: spec.id,
        fqdn: spec.fqdn,
        public_ip: spec.location ? LOCATIONS[spec.location].ip : '—',
        private_ip: spec.private_ip,
        port: 8080,
        version: spec.version,

        status: spec.status,
        last_seen_at: spec.lastSeenMinutesAgo === null
            ? null
            : now - spec.lastSeenMinutesAgo * MINUTE_MS,
        started_at: spec.uptimeHours === null ? null : now - spec.uptimeHours * 60 * MINUTE_MS,

        nodes: spec.nodes,
        connections: spec.connections,
        sessions: spec.sessions,

        host_name: spec.host_name,
        host_os_info: spec.host_os_info,
        location: spec.location ? LOCATIONS[spec.location] : null,

        cpu_percent: spec.cpu,
        mem_used_bytes: spec.memUsedGb === null ? null : Math.round(spec.memUsedGb * GB),
        mem_total_bytes: spec.memTotalGb === null ? null : Math.round(spec.memTotalGb * GB),
        load_average: spec.load,
        uptime_secs: spec.uptimeHours === null ? null : spec.uptimeHours * 3600,
    }));
}

/** The newest version anywhere in the fleet, used to flag instances behind it. */
export function latestFleetVersion(servers: ServerInstance[]): string {
    return servers
        .map((server) => server.version)
        .sort((a, b) => compareVersions(b, a))[0] ?? '';
}

export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
    const pb = b.split('.').map((part) => parseInt(part, 10) || 0);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const delta = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (delta !== 0) return delta;
    }

    return 0;
}
