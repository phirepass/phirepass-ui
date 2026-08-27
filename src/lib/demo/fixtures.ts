import type { PublicIpLocation } from '@/types/geo';
import type { NodeLanFingerprint, NodeStatus } from '@/types/node';
import type { KeywordMode, MonitorKind } from '@/types/monitor';
import type { UserInfo } from '@/app/lib/types';
import type { DevicePlatform } from '@/types/notification';

/**
 * The fleet demo mode pretends to own.
 *
 * These are *specifications*, not wire objects: nothing here carries a
 * timestamp, a percentage or a status. Everything time-dependent is derived on
 * read (see `store.ts`) so that a demo left open for an hour keeps saying "last
 * checked 3 minutes ago" instead of ageing into a fleet that has clearly been
 * abandoned.
 *
 * The set is chosen to tell the product's story in one screen: cloud servers
 * anyone could reach anyway, plus the machines that are the actual point — a
 * shop till, a factory gateway, an office NAS — sitting behind NAT with no
 * inbound ports, watched by monitors that only work because the check runs on
 * the machine itself.
 */

/** Fixed ids: `parseMonitor` requires a UUID for `node_id`, and stable ids keep
 * a reloaded demo on the same node the presenter just opened. */
export const DEMO_NODE_IDS = {
    edgeFra: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c01',
    apiAms: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c02',
    k3sNyc: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c03',
    posBerlin: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c04',
    warehouseOsaka: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c05',
    officeNas: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c06',
    winLab: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c07',
    backupOslo: '2f6f1d7a-1c34-4f8e-9c1a-6d2b7a3e5c08',
} as const;

/**
 * Who the dashboard says you are while the sample fleet is on screen.
 *
 * The signed-in account is real — demo mode bypasses no authentication — but
 * showing the presenter's own name and address next to a fixture is both a
 * mismatch and a small privacy leak in a room with a projector. So the header
 * identity is part of the fixture too: the same person the sample fleet
 * belongs to.
 *
 * `avatar_url` is deliberately empty. There is no avatar to invent, and the
 * header falls back to initials.
 */
export const DEMO_USER: UserInfo = {
    id: '9b1c2d3e-4f50-4a61-8b72-0c9d8e7f6a5b',
    username: 'Alex Rivera',
    email: 'alex@phirepass.com',
    avatar_url: '',
    roles: ['owner'],
    provider: 'demo',
};

const LOCATIONS = {
    frankfurt: {
        ip: '138.201.44.9', hostname: 'static.9.44.201.138.clients.your-server.de',
        city: 'Frankfurt', region: 'Hesse', country: 'Germany', country_code: 'DE',
        continent: 'Europe', latitude: 50.1109, longitude: 8.6821,
        time_zone: 'Europe/Berlin', asn: 'AS24940', asn_org: 'Hetzner Online GmbH',
    },
    amsterdam: {
        ip: '45.83.107.22', city: 'Amsterdam', region: 'North Holland', country: 'Netherlands',
        country_code: 'NL', continent: 'Europe', latitude: 52.3676, longitude: 4.9041,
        time_zone: 'Europe/Amsterdam', asn: 'AS60781', asn_org: 'LeaseWeb Netherlands B.V.',
    },
    newYork: {
        ip: '104.28.61.14', city: 'New York', region: 'New York', country: 'United States',
        country_code: 'US', continent: 'North America', latitude: 40.7128, longitude: -74.0060,
        time_zone: 'America/New_York', asn: 'AS13335', asn_org: 'Cloudflare, Inc.',
    },
    berlin: {
        ip: '91.64.201.183', city: 'Berlin', region: 'Berlin', country: 'Germany',
        country_code: 'DE', continent: 'Europe', latitude: 52.5200, longitude: 13.4050,
        time_zone: 'Europe/Berlin', asn: 'AS3320', asn_org: 'Deutsche Telekom AG',
    },
    osaka: {
        ip: '118.238.14.77', city: 'Osaka', region: 'Osaka', country: 'Japan',
        country_code: 'JP', continent: 'Asia', latitude: 34.6937, longitude: 135.5023,
        time_zone: 'Asia/Tokyo', asn: 'AS2516', asn_org: 'KDDI Corporation',
    },
    london: {
        ip: '82.132.19.4', city: 'London', region: 'England', country: 'United Kingdom',
        country_code: 'GB', continent: 'Europe', latitude: 51.5072, longitude: -0.1276,
        time_zone: 'Europe/London', asn: 'AS5607', asn_org: 'Sky UK Limited',
    },
    austin: {
        ip: '70.114.203.61', city: 'Austin', region: 'Texas', country: 'United States',
        country_code: 'US', continent: 'North America', latitude: 30.2672, longitude: -97.7431,
        time_zone: 'America/Chicago', asn: 'AS7922', asn_org: 'Comcast Cable',
    },
    oslo: {
        ip: '84.208.44.16', city: 'Oslo', region: 'Oslo', country: 'Norway',
        country_code: 'NO', continent: 'Europe', latitude: 59.9139, longitude: 10.7522,
        time_zone: 'Europe/Oslo', asn: 'AS2119', asn_org: 'Telenor Norge AS',
    },
} satisfies Record<string, PublicIpLocation>;

export type DemoServiceKind = 'SSH' | 'SFTP' | 'HTTP' | 'RDP';

export interface DemoServiceSpec {
    id: string;
    name: string | null;
    kind: DemoServiceKind;
    host: string;
    port: number;
    username: string | null;
    scheme: 'http' | 'https' | null;
}

export interface DemoDiskSpec {
    mount: string;
    fs_type: string;
    total_bytes: number;
    /** Fraction of the volume in use; the free figure is derived from it. */
    used: number;
}

export interface DemoNodeSpec {
    id: string;
    name: string;
    status: NodeStatus;
    host_name: string;
    host_os_info: string;
    version: string;
    host_local_ip: string;
    host_mac: string;
    location: PublicIpLocation;
    lan: NodeLanFingerprint;
    /** Centre of the live oscillation, in percent. */
    cpu: number;
    mem_total_bytes: number;
    /** Fraction of RAM in use, before jitter. */
    mem_used: number;
    load_average: [number, number, number];
    processes: number;
    connections: number;
    uptime_days: number;
    connected_hours: number;
    enrolled_days_ago: number;
    disks: DemoDiskSpec[];
    services: DemoServiceSpec[];
}

const GB = 1024 ** 3;

export const DEMO_NODE_SPECS: DemoNodeSpec[] = [
    {
        id: DEMO_NODE_IDS.edgeFra,
        name: 'edge-fra-01',
        status: 'online',
        host_name: 'edge-fra-01',
        host_os_info: 'Ubuntu 24.04.1 LTS (6.8.0-45-generic)',
        version: '0.4.19',
        host_local_ip: '10.0.1.11',
        host_mac: '96:00:02:8c:41:aa',
        location: LOCATIONS.frankfurt,
        lan: { gateway_mac: '02:42:ac:11:00:01', gateway_ip: '10.0.1.1', cidr: '10.0.1.0/24', iface: 'eth0' },
        cpu: 23,
        mem_total_bytes: 16 * GB,
        mem_used: 0.41,
        load_average: [0.42, 0.51, 0.47],
        processes: 214,
        connections: 348,
        uptime_days: 96,
        connected_hours: 412,
        enrolled_days_ago: 121,
        disks: [
            { mount: '/', fs_type: 'ext4', total_bytes: 160 * GB, used: 0.44 },
            { mount: '/var/lib/docker', fs_type: 'ext4', total_bytes: 400 * GB, used: 0.61 },
        ],
        services: [
            { id: 'svc-fra-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'deploy', scheme: null },
            { id: 'svc-fra-sftp', name: 'files', kind: 'SFTP', host: '0.0.0.0', port: 22, username: 'deploy', scheme: null },
            { id: 'svc-fra-http', name: 'Grafana', kind: 'HTTP', host: '127.0.0.1', port: 3000, username: null, scheme: 'http' },
        ],
    },
    {
        id: DEMO_NODE_IDS.apiAms,
        name: 'api-ams-prod',
        status: 'online',
        host_name: 'api-ams-prod',
        host_os_info: 'Debian GNU/Linux 12 (bookworm) (6.1.0-25-amd64)',
        version: '0.4.19',
        host_local_ip: '10.0.4.23',
        host_mac: '52:54:00:9d:3e:71',
        location: LOCATIONS.amsterdam,
        lan: { gateway_mac: '52:54:00:12:35:02', gateway_ip: '10.0.4.1', cidr: '10.0.4.0/22', iface: 'ens3' },
        cpu: 57,
        mem_total_bytes: 32 * GB,
        mem_used: 0.68,
        load_average: [1.84, 1.62, 1.55],
        processes: 331,
        connections: 1284,
        uptime_days: 41,
        connected_hours: 173,
        enrolled_days_ago: 98,
        disks: [
            { mount: '/', fs_type: 'ext4', total_bytes: 200 * GB, used: 0.52 },
            { mount: '/srv/postgres', fs_type: 'xfs', total_bytes: 1000 * GB, used: 0.77 },
        ],
        services: [
            { id: 'svc-ams-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'ops', scheme: null },
            { id: 'svc-ams-http', name: 'Checkout API', kind: 'HTTP', host: '127.0.0.1', port: 8080, username: null, scheme: 'http' },
            { id: 'svc-ams-sftp', name: 'exports', kind: 'SFTP', host: '0.0.0.0', port: 22, username: 'ops', scheme: null },
        ],
    },
    {
        id: DEMO_NODE_IDS.k3sNyc,
        name: 'k3s-worker-nyc',
        status: 'online',
        host_name: 'k3s-worker-nyc-02',
        host_os_info: 'Alpine Linux 3.20 (6.6.47-0-lts)',
        version: '0.4.19',
        host_local_ip: '172.20.8.44',
        host_mac: '0a:58:ac:14:08:2c',
        location: LOCATIONS.newYork,
        lan: { gateway_mac: '0a:58:ac:14:08:01', gateway_ip: '172.20.8.1', cidr: '172.20.8.0/20', iface: 'eth0', container: true },
        cpu: 71,
        mem_total_bytes: 8 * GB,
        mem_used: 0.74,
        load_average: [2.31, 2.05, 1.88],
        processes: 128,
        connections: 512,
        uptime_days: 12,
        connected_hours: 61,
        enrolled_days_ago: 63,
        disks: [
            { mount: '/', fs_type: 'overlay', total_bytes: 60 * GB, used: 0.66 },
        ],
        services: [
            { id: 'svc-nyc-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'root', scheme: null },
            { id: 'svc-nyc-http', name: 'Kubelet metrics', kind: 'HTTP', host: '127.0.0.1', port: 10250, username: null, scheme: 'https' },
        ],
    },
    {
        id: DEMO_NODE_IDS.posBerlin,
        name: 'pos-berlin-mitte',
        status: 'online',
        host_name: 'pos-till-03',
        host_os_info: 'Raspberry Pi OS 12 (6.6.51+rpt-rpi-v8)',
        version: '0.4.18',
        host_local_ip: '192.168.42.7',
        host_mac: 'd8:3a:dd:41:9b:02',
        location: LOCATIONS.berlin,
        lan: { gateway_mac: 'a0:63:91:2c:74:10', gateway_ip: '192.168.42.1', cidr: '192.168.42.0/24', iface: 'wlan0' },
        cpu: 34,
        mem_total_bytes: 4 * GB,
        mem_used: 0.52,
        load_average: [0.71, 0.66, 0.58],
        processes: 96,
        connections: 41,
        uptime_days: 27,
        connected_hours: 649,
        enrolled_days_ago: 74,
        disks: [
            { mount: '/', fs_type: 'ext4', total_bytes: 32 * GB, used: 0.83 },
        ],
        services: [
            { id: 'svc-pos-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'pi', scheme: null },
            { id: 'svc-pos-http', name: 'Till console', kind: 'HTTP', host: '127.0.0.1', port: 9000, username: null, scheme: 'http' },
        ],
    },
    {
        id: DEMO_NODE_IDS.warehouseOsaka,
        name: 'warehouse-gw-osaka',
        status: 'online',
        host_name: 'wh-gateway-osk',
        host_os_info: 'Debian GNU/Linux 12 (bookworm) (6.1.0-23-arm64)',
        version: '0.4.19',
        host_local_ip: '10.20.4.2',
        host_mac: '00:16:3e:5f:c1:44',
        location: LOCATIONS.osaka,
        lan: { gateway_mac: '00:16:3e:00:01:01', gateway_ip: '10.20.4.1', cidr: '10.20.4.0/24', iface: 'eth0' },
        cpu: 18,
        mem_total_bytes: 8 * GB,
        mem_used: 0.37,
        load_average: [0.22, 0.28, 0.31],
        processes: 142,
        connections: 87,
        uptime_days: 213,
        connected_hours: 1104,
        enrolled_days_ago: 216,
        disks: [
            { mount: '/', fs_type: 'ext4', total_bytes: 64 * GB, used: 0.38 },
            { mount: '/mnt/labels', fs_type: 'ext4', total_bytes: 128 * GB, used: 0.24 },
        ],
        services: [
            { id: 'svc-osk-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'admin', scheme: null },
            { id: 'svc-osk-sftp', name: 'label drop', kind: 'SFTP', host: '0.0.0.0', port: 22, username: 'admin', scheme: null },
            { id: 'svc-osk-http', name: 'WMS console', kind: 'HTTP', host: '10.20.4.11', port: 8080, username: null, scheme: 'http' },
        ],
    },
    {
        id: DEMO_NODE_IDS.officeNas,
        name: 'office-nas-london',
        status: 'online',
        host_name: 'acme-nas',
        host_os_info: 'Synology DSM 7.2 (4.4.302+)',
        version: '0.4.18',
        host_local_ip: '192.168.1.20',
        host_mac: '00:11:32:8a:14:c9',
        location: LOCATIONS.london,
        lan: { gateway_mac: 'e4:8d:8c:33:21:07', gateway_ip: '192.168.1.1', cidr: '192.168.1.0/24', iface: 'eth0' },
        cpu: 11,
        mem_total_bytes: 16 * GB,
        mem_used: 0.29,
        load_average: [0.18, 0.20, 0.24],
        processes: 173,
        connections: 62,
        uptime_days: 158,
        connected_hours: 903,
        enrolled_days_ago: 160,
        disks: [
            { mount: '/volume1', fs_type: 'btrfs', total_bytes: 8000 * GB, used: 0.71 },
            { mount: '/volume2', fs_type: 'btrfs', total_bytes: 4000 * GB, used: 0.92 },
        ],
        services: [
            { id: 'svc-nas-sftp', name: 'shares', kind: 'SFTP', host: '0.0.0.0', port: 22, username: 'backup', scheme: null },
            { id: 'svc-nas-http', name: 'DSM', kind: 'HTTP', host: '127.0.0.1', port: 5001, username: null, scheme: 'https' },
        ],
    },
    {
        id: DEMO_NODE_IDS.winLab,
        name: 'win-lab-austin',
        status: 'connecting',
        host_name: 'ACME-LAB-W11',
        host_os_info: 'Windows 11 Pro 23H2 (22631.4169)',
        version: '0.4.19',
        host_local_ip: '192.168.10.34',
        host_mac: '3c:52:82:0f:6d:11',
        location: LOCATIONS.austin,
        lan: { gateway_mac: 'f8:1a:67:90:44:2b', gateway_ip: '192.168.10.1', cidr: '192.168.10.0/24', iface: 'Ethernet' },
        cpu: 26,
        mem_total_bytes: 32 * GB,
        mem_used: 0.46,
        load_average: [0, 0, 0],
        processes: 241,
        connections: 154,
        uptime_days: 3,
        connected_hours: 0,
        enrolled_days_ago: 35,
        disks: [
            { mount: 'C:\\', fs_type: 'NTFS', total_bytes: 512 * GB, used: 0.58 },
        ],
        services: [
            { id: 'svc-lab-rdp', name: 'Lab desktop', kind: 'RDP', host: '127.0.0.1', port: 3389, username: null, scheme: null },
            { id: 'svc-lab-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'labadmin', scheme: null },
        ],
    },
    {
        id: DEMO_NODE_IDS.backupOslo,
        name: 'backup-vault-oslo',
        status: 'offline',
        host_name: 'vault-oslo',
        host_os_info: 'Ubuntu 22.04.4 LTS (5.15.0-119-generic)',
        version: '0.4.16',
        host_local_ip: '10.30.0.9',
        host_mac: '4c:52:62:1d:88:03',
        location: LOCATIONS.oslo,
        lan: { gateway_mac: '4c:52:62:00:00:01', gateway_ip: '10.30.0.1', cidr: '10.30.0.0/24', iface: 'eno1' },
        cpu: 0,
        mem_total_bytes: 64 * GB,
        mem_used: 0,
        load_average: [0, 0, 0],
        processes: 0,
        connections: 0,
        uptime_days: 0,
        connected_hours: 0,
        enrolled_days_ago: 189,
        disks: [
            { mount: '/', fs_type: 'ext4', total_bytes: 240 * GB, used: 0.31 },
            { mount: '/srv/restic', fs_type: 'zfs', total_bytes: 16000 * GB, used: 0.64 },
        ],
        services: [
            { id: 'svc-oslo-ssh', name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, username: 'backup', scheme: null },
            { id: 'svc-oslo-sftp', name: 'restic repo', kind: 'SFTP', host: '0.0.0.0', port: 22, username: 'backup', scheme: null },
        ],
    },
];

/**
 * A stretch of time a monitor's target was unavailable.
 *
 * Anchored to a day and an hour rather than to absolute instants so the story
 * moves with the calendar: "the outage was last Tuesday night" stays true
 * whenever the demo is given. `duration_mins: null` means it is still open,
 * which is how a monitor ends up red on screen.
 */
export interface DemoOutage {
    days_ago: number;
    start_hour: number;
    duration_mins: number | null;
    cause: string;
    status_code: number | null;
}

/** A window where the agent itself was unreachable, so no verdict was reached. */
export interface DemoBlindWindow {
    days_ago: number;
    start_hour: number;
    duration_mins: number | null;
}

/**
 * A stretch where the target answered correctly but slowly.
 *
 * Modelled as a window rather than as a monitor's baseline, because a service
 * that has been slow for thirty days is not a demo of anything — the state
 * worth showing is a monitor that was fine and is now amber, which is what the
 * strip renders as a band of colour at one end.
 */
export interface DemoSlowdown {
    days_ago: number;
    start_hour: number;
    duration_mins: number | null;
    /** Response time inside the window; above `degraded_ms` is what turns it amber. */
    latency_ms: number;
}

export interface DemoMonitorSpec {
    id: string;
    node_id: string;
    name: string;
    kind: MonitorKind;
    target: string;
    interval_secs: number;
    timeout_ms: number;
    method: string;
    expected_status: number[];
    keyword: string | null;
    keyword_mode: KeywordMode;
    follow_redirects: boolean;
    degraded_ms: number;
    expiry_warn_days: number;
    paused: boolean;
    agent_offline_is_outage: boolean;
    created_days_ago: number;
    /** Typical response time; the live jitter oscillates around it. */
    latency_ms: number | null;
    status_code: number | null;
    outages: DemoOutage[];
    blind: DemoBlindWindow[];
    slowdowns: DemoSlowdown[];
    /** Days until the certificate lapses; negative is already expired. */
    cert_expires_in_days?: number;
    cert_issuer?: string;
    cert_subject?: string;
    domain_expires_in_days?: number;
    domain_registrar?: string;
    location: PublicIpLocation | null;
}

/** Everything an `http` monitor leaves at its default. */
const HTTP_DEFAULTS = {
    kind: 'http' as const,
    interval_secs: 900,
    timeout_ms: 10_000,
    method: 'GET',
    expected_status: [200],
    keyword: null,
    keyword_mode: 'contains' as const,
    follow_redirects: true,
    degraded_ms: 1_500,
    expiry_warn_days: 14,
    paused: false,
    agent_offline_is_outage: false,
    blind: [] as DemoBlindWindow[],
    outages: [] as DemoOutage[],
    slowdowns: [] as DemoSlowdown[],
};

/** Certificate and registry checks answer once a day and warn ahead of expiry. */
const EXPIRY_DEFAULTS = {
    interval_secs: 86_400,
    timeout_ms: 10_000,
    method: 'GET',
    expected_status: [] as number[],
    keyword: null,
    keyword_mode: 'contains' as const,
    follow_redirects: true,
    degraded_ms: 5_000,
    paused: false,
    agent_offline_is_outage: false,
    blind: [] as DemoBlindWindow[],
    outages: [] as DemoOutage[],
    slowdowns: [] as DemoSlowdown[],
};

export const DEMO_MONITOR_SPECS: DemoMonitorSpec[] = [
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea01',
        node_id: DEMO_NODE_IDS.apiAms,
        name: 'Checkout API',
        target: 'https://api.acme-retail.demo/health',
        keyword: '"status":"ok"',
        created_days_ago: 96,
        latency_ms: 184,
        status_code: 200,
        location: LOCATIONS.amsterdam,
        outages: [
            { days_ago: 17, start_hour: 2, duration_mins: 34, cause: 'HTTP 502 from upstream', status_code: 502 },
        ],
        slowdowns: [
            { days_ago: 8, start_hour: 7, duration_mins: 145, latency_ms: 1_780 },
        ],
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea02',
        node_id: DEMO_NODE_IDS.apiAms,
        name: 'Storefront',
        target: 'https://acme-retail.demo/',
        created_days_ago: 96,
        latency_ms: 430,
        status_code: 200,
        location: LOCATIONS.amsterdam,
        outages: [
            { days_ago: 17, start_hour: 2, duration_mins: 34, cause: 'HTTP 502 from upstream', status_code: 502 },
        ],
        // Slow right now, above the 1.5s threshold: answering correctly, just
        // not fast enough. The state that exists precisely because paging
        // someone at 3am for a slow page is the wrong response.
        slowdowns: [
            { days_ago: 0, start_hour: -3, duration_mins: null, latency_ms: 1_950 },
            { days_ago: 11, start_hour: 9, duration_mins: 180, latency_ms: 2_400 },
        ],
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea03',
        node_id: DEMO_NODE_IDS.warehouseOsaka,
        name: 'Warehouse WMS (internal)',
        target: 'http://10.20.4.11:8080/api/health',
        created_days_ago: 74,
        latency_ms: 61,
        status_code: 200,
        // A private address has no public location to place on a map, and the
        // fact that this target is unreachable from the internet is the point.
        location: null,
        outages: [
            { days_ago: 9, start_hour: 21, duration_mins: 26, cause: 'Connection refused', status_code: null },
        ],
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea04',
        node_id: DEMO_NODE_IDS.posBerlin,
        name: 'Till sync service',
        target: 'http://192.168.42.7:9000/status',
        created_days_ago: 61,
        latency_ms: 44,
        status_code: null,
        location: null,
        outages: [
            // Still open: the fleet has one thing genuinely broken right now.
            { days_ago: 0, start_hour: -2, duration_mins: null, cause: 'Connection refused (111)', status_code: null },
            { days_ago: 5, start_hour: 13, duration_mins: 22, cause: 'Connection refused (111)', status_code: null },
        ],
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea05',
        node_id: DEMO_NODE_IDS.edgeFra,
        name: 'Grafana',
        target: 'http://127.0.0.1:3000/api/health',
        created_days_ago: 118,
        latency_ms: 38,
        status_code: 200,
        location: null,
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea06',
        node_id: DEMO_NODE_IDS.k3sNyc,
        name: 'Cluster ingress',
        target: 'https://ingress.acme-retail.demo/healthz',
        created_days_ago: 55,
        latency_ms: 122,
        status_code: 200,
        location: LOCATIONS.newYork,
        outages: [
            { days_ago: 3, start_hour: 5, duration_mins: 24, cause: 'Gateway timeout', status_code: 504 },
            { days_ago: 22, start_hour: 18, duration_mins: 51, cause: 'Gateway timeout', status_code: 504 },
        ],
        slowdowns: [
            { days_ago: 3, start_hour: 4, duration_mins: 60, latency_ms: 2_100 },
        ],
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea07',
        node_id: DEMO_NODE_IDS.officeNas,
        name: 'Nightly backup report',
        target: 'http://192.168.1.20:5001/webapi/status.cgi',
        keyword: 'last_backup_failed',
        keyword_mode: 'absent',
        created_days_ago: 143,
        latency_ms: 96,
        status_code: 200,
        location: null,
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea08',
        node_id: DEMO_NODE_IDS.backupOslo,
        name: 'Vault restic endpoint',
        target: 'http://10.30.0.9:8000/',
        created_days_ago: 152,
        latency_ms: 73,
        status_code: 200,
        location: null,
        // The agent on that node is down, so nothing is being learned about the
        // target — `unknown`, not `down`, because `agent_offline_is_outage` is
        // false and an agent restart is not an outage of the thing it watches.
        blind: [{ days_ago: 0, start_hour: -6, duration_mins: null }],
    },
    {
        ...HTTP_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ea09',
        node_id: DEMO_NODE_IDS.edgeFra,
        name: 'Legacy VPN portal',
        target: 'https://vpn-old.acme-retail.demo/login',
        created_days_ago: 210,
        paused: true,
        latency_ms: 311,
        status_code: 200,
        location: LOCATIONS.frankfurt,
    },
    {
        ...EXPIRY_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000eb01',
        kind: 'ssl',
        node_id: DEMO_NODE_IDS.apiAms,
        name: 'acme-retail.demo certificate',
        target: 'acme-retail.demo:443',
        expiry_warn_days: 14,
        created_days_ago: 96,
        latency_ms: 74,
        status_code: null,
        cert_expires_in_days: 9,
        cert_issuer: "Let's Encrypt R11",
        cert_subject: 'CN=acme-retail.demo',
        location: LOCATIONS.amsterdam,
    },
    {
        ...EXPIRY_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000eb02',
        kind: 'ssl',
        node_id: DEMO_NODE_IDS.apiAms,
        name: 'api.acme-retail.demo certificate',
        target: 'api.acme-retail.demo:443',
        expiry_warn_days: 14,
        created_days_ago: 96,
        latency_ms: 68,
        status_code: null,
        cert_expires_in_days: 63,
        cert_issuer: "Let's Encrypt R11",
        cert_subject: 'CN=api.acme-retail.demo',
        location: LOCATIONS.amsterdam,
    },
    {
        ...EXPIRY_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000eb03',
        kind: 'ssl',
        node_id: DEMO_NODE_IDS.warehouseOsaka,
        name: 'wms.acme.internal certificate',
        target: 'wms.acme.internal:8443',
        expiry_warn_days: 21,
        created_days_ago: 74,
        latency_ms: 22,
        status_code: null,
        // The one an external monitoring service could never see: an internal CA
        // on a name that only resolves inside the warehouse network.
        cert_expires_in_days: 4,
        cert_issuer: 'ACME Internal Issuing CA G2',
        cert_subject: 'CN=wms.acme.internal',
        location: null,
    },
    {
        ...EXPIRY_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ec01',
        kind: 'domain',
        node_id: DEMO_NODE_IDS.edgeFra,
        name: 'acme-retail.demo registration',
        target: 'acme-retail.demo',
        expiry_warn_days: 30,
        created_days_ago: 96,
        latency_ms: 412,
        status_code: null,
        domain_expires_in_days: 41,
        domain_registrar: 'Gandi SAS',
        // RDAP asks a registry about a name and never opens a connection to the
        // domain's hosts, so there is nothing to place on a map.
        location: null,
    },
    {
        ...EXPIRY_DEFAULTS,
        id: 'a1000000-0000-4000-8000-00000000ec02',
        kind: 'domain',
        node_id: DEMO_NODE_IDS.edgeFra,
        name: 'acme-retail.eu registration',
        target: 'acme-retail.eu',
        expiry_warn_days: 30,
        created_days_ago: 96,
        latency_ms: 508,
        status_code: null,
        domain_expires_in_days: 11,
        domain_registrar: 'EURid / Gandi SAS',
        location: null,
    },
];

export interface DemoTokenSpec {
    id: string;
    token_id: string;
    name: string;
    created_days_ago: number;
    /** Days from now until it lapses; null never expires, negative already has. */
    expires_in_days: number | null;
    /** Hours since an agent last presented it; null when never used. */
    last_used_hours_ago: number | null;
}

export const DEMO_TOKEN_SPECS: DemoTokenSpec[] = [
    {
        id: 'c1000000-0000-4000-8000-0000000f0001',
        token_id: '7Qk2Vd9mXrTb',
        name: 'Fleet rollout 2026',
        created_days_ago: 63,
        expires_in_days: 302,
        last_used_hours_ago: 5,
    },
    {
        id: 'c1000000-0000-4000-8000-0000000f0002',
        token_id: '3Hn8Lp4wZcQe',
        name: 'Retail store enrolment',
        created_days_ago: 74,
        // Inside the warning window, so the token page has something to say.
        expires_in_days: 6,
        last_used_hours_ago: 39,
    },
    {
        id: 'c1000000-0000-4000-8000-0000000f0003',
        token_id: '9Yt5Rj1sNvKa',
        name: 'CI provisioning',
        created_days_ago: 121,
        expires_in_days: null,
        last_used_hours_ago: 214,
    },
    {
        id: 'c1000000-0000-4000-8000-0000000f0004',
        token_id: '2Bd6Fk0qWmXu',
        name: 'Warehouse pilot (retired)',
        created_days_ago: 198,
        expires_in_days: -12,
        last_used_hours_ago: 3_400,
    },
];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The hash the demo's "this browser" row carries.
 *
 * The real page works out which device it is running on by hashing its own push
 * subscription's endpoint and matching it against the list. Demo mode has no
 * subscription — it must not create one, or a booth laptop leaves a real
 * registration behind and a permission prompt on stage — so the two sides agree
 * on this constant instead. `NotificationsPage` uses it in place of the hash
 * whenever the demo is on.
 *
 * Thirty-two hex characters, because that is what `endpointHash` produces and a
 * value of another shape would be obvious in a screenshot.
 */
export const DEMO_CURRENT_ENDPOINT_HASH = '4b7e2c19a0d5f38641c9be07d2a5f183';

export interface DemoDeviceSpec {
    id: string;
    endpoint_hash: string;
    label: string;
    platform: DevicePlatform;
    browser: string;
    created_days_ago: number;
    last_active_minutes_ago: number;
}

/**
 * Four browsers, which is what an account that actually uses this looks like:
 * the machine being presented from, a phone, a second desktop, and one that has
 * not checked in for months so the page's "stale device" notice has something
 * to point at.
 */
export const DEMO_DEVICE_SPECS: DemoDeviceSpec[] = [
    {
        id: 'd1000000-0000-4000-8000-0000000e0001',
        endpoint_hash: DEMO_CURRENT_ENDPOINT_HASH,
        label: 'This browser',
        platform: 'macos',
        browser: 'Chrome',
        created_days_ago: 41,
        last_active_minutes_ago: 2,
    },
    {
        id: 'd1000000-0000-4000-8000-0000000e0002',
        endpoint_hash: 'a91f04c7be2d5108f36a7c40e5b91d22',
        label: 'Pixel 9',
        platform: 'android',
        browser: 'Chrome',
        created_days_ago: 27,
        last_active_minutes_ago: 96,
    },
    {
        id: 'd1000000-0000-4000-8000-0000000e0003',
        endpoint_hash: '5c30ea8b14d7f962a0b3c8517e46d09f',
        label: 'Ops workstation',
        platform: 'linux',
        browser: 'Firefox',
        created_days_ago: 88,
        last_active_minutes_ago: 640,
    },
    {
        // Well past the staleness threshold, so the page shows the notice that
        // says the browser has most likely dropped this subscription already.
        id: 'd1000000-0000-4000-8000-0000000e0004',
        endpoint_hash: 'ff62b7d0193ac4e58721036d9be4a5c1',
        label: 'Old laptop',
        platform: 'windows',
        browser: 'Edge',
        created_days_ago: 210,
        last_active_minutes_ago: 148 * 24 * 60,
    },
];

export interface DemoWebhookSpec {
    id: string;
    name: string;
    url: string;
    secret_hint: string;
    enabled: boolean;
    created_days_ago: number;
    last_sent_hours_ago: number | null;
    last_status: number | null;
    last_error: string | null;
    fail_count: number;
}

/**
 * Three endpoints covering the three states the card can be in: delivering,
 * failing, and paused. A demo where everything is green never shows what the
 * health chip or the error line are for.
 */
export const DEMO_WEBHOOK_SPECS: DemoWebhookSpec[] = [
    {
        id: 'e1000000-0000-4000-8000-0000000d0001',
        name: 'Ops Slack relay',
        url: 'https://hooks.example.com/services/T024/B071/xQ2f',
        secret_hint: 'k4Rz',
        enabled: true,
        created_days_ago: 54,
        last_sent_hours_ago: 3,
        last_status: 200,
        last_error: null,
        fail_count: 0,
    },
    {
        id: 'e1000000-0000-4000-8000-0000000d0002',
        name: 'PagerDuty intake',
        url: 'https://events.example.net/v2/enqueue',
        secret_hint: '9tLm',
        enabled: true,
        created_days_ago: 31,
        last_sent_hours_ago: 9,
        last_status: 502,
        last_error: 'the endpoint answered 502',
        fail_count: 4,
    },
    {
        id: 'e1000000-0000-4000-8000-0000000d0003',
        name: 'Staging receiver',
        url: 'https://staging.example.org/phirepass/webhook',
        secret_hint: 'wB3q',
        enabled: false,
        created_days_ago: 12,
        last_sent_hours_ago: null,
        last_status: null,
        last_error: null,
        fail_count: 0,
    },
];
