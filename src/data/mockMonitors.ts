import type {
    CheckPoint,
    DailyBucket,
    Incident,
    MonitorDetail,
    MonitorKind,
    MonitorStatus,
    MonitorSummary,
    UptimeWindow,
} from '@/types/uptime';
import type { PublicIpLocation } from '@/types/geo';

/**
 * Sample data for the uptime dashboard. There is no backend behind this page —
 * it exists to show the shape of the feature, so every number here is generated,
 * not measured.
 *
 * History is produced from a seeded PRNG rather than `Math.random`, so a monitor
 * looks identical on every render and across a remount. Timestamps are derived
 * from a `now` passed in by the caller, so the whole set can be built once when
 * the page mounts instead of drifting per component.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;

/** mulberry32 — small, fast, and good enough for plausible-looking noise. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashSeed(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Stand-in points of presence for the sample targets, so the location map has
 * something plausible to plot while the uptime backend is still mock. Real data
 * would come from resolving the target and geolocating the address the check
 * connected to.
 */
const POPS = {
    frankfurt: {
        ip: '138.201.14.72', city: 'Frankfurt', region: 'Hesse', country: 'Germany',
        country_code: 'DE', continent: 'Europe', latitude: 50.1109, longitude: 8.6821,
        time_zone: 'Europe/Berlin', asn: 'AS24940', asn_org: 'Hetzner Online GmbH',
    },
    amsterdam: {
        ip: '95.216.44.19', city: 'Amsterdam', region: 'North Holland', country: 'Netherlands',
        country_code: 'NL', continent: 'Europe', latitude: 52.3676, longitude: 4.9041,
        time_zone: 'Europe/Amsterdam', asn: 'AS16509', asn_org: 'Amazon Data Services',
    },
    ashburn: {
        ip: '54.85.132.7', city: 'Ashburn', region: 'Virginia', country: 'United States',
        country_code: 'US', continent: 'North America', latitude: 39.0438, longitude: -77.4874,
        time_zone: 'America/New_York', asn: 'AS14618', asn_org: 'Amazon.com, Inc.',
    },
    singapore: {
        ip: '13.228.61.144', city: 'Singapore', region: 'Singapore', country: 'Singapore',
        country_code: 'SG', continent: 'Asia', latitude: 1.3521, longitude: 103.8198,
        time_zone: 'Asia/Singapore', asn: 'AS16509', asn_org: 'Amazon Data Services',
    },
} satisfies Record<string, PublicIpLocation>;

interface MonitorSpec {
    id: string;
    name: string;
    kind: MonitorKind;
    target: string;
    /**
     * Omitted where a real probe would have nothing to geolocate: `domain`
     * monitors never open a connection, and a target on a private range has no
     * public address.
     */
    location?: PublicIpLocation;
    status: MonitorStatus;
    interval_secs: number;
    /** Typical response time in ms; history wobbles around it. */
    baseLatency: number | null;
    degraded_ms: number;
    /** Day offsets (0 = today) that carry failed checks. */
    outageDays?: number[];
    /** Fraction of that day's checks that failed. */
    outageSeverity?: number;
    method?: string;
    expected_status?: number[];
    keyword?: string | null;
    last_status_code?: number | null;
    last_error?: string | null;
    paused?: boolean;
    expiry_warn_days?: number;
    /** Days from now; negative means already expired. */
    certExpiresInDays?: number;
    cert_issuer?: string;
    cert_subject?: string;
    domainExpiresInDays?: number;
    domain_registrar?: string;
    /** Minutes since the currently-open incident began. */
    openIncidentMinutesAgo?: number;
    createdDaysAgo: number;
}

/**
 * Deliberately spread across every state the UI can render: healthy, slow,
 * broken, paused, indeterminate, and both flavours of approaching expiry.
 */
const SPECS: MonitorSpec[] = [
    {
        id: 'mon-marketing',
        name: 'Marketing site',
        kind: 'http',
        target: 'https://phirepass.com',
        location: POPS.frankfurt,
        status: 'up',
        interval_secs: 300,
        baseLatency: 184,
        degraded_ms: 1500,
        last_status_code: 200,
        createdDaysAgo: 240,
    },
    {
        id: 'mon-dashboard',
        name: 'Dashboard health',
        kind: 'http',
        target: 'https://app.phirepass.com/healthz',
        location: POPS.frankfurt,
        status: 'up',
        interval_secs: 60,
        baseLatency: 243,
        degraded_ms: 1200,
        keyword: '"status":"ok"',
        expected_status: [200],
        last_status_code: 200,
        outageDays: [11],
        outageSeverity: 0.04,
        createdDaysAgo: 186,
    },
    {
        id: 'mon-relay',
        name: 'Relay health',
        kind: 'http',
        target: 'https://relay.phirepass.com/healthz',
        location: POPS.amsterdam,
        status: 'up',
        interval_secs: 60,
        baseLatency: 61,
        degraded_ms: 800,
        expected_status: [200],
        last_status_code: 200,
        createdDaysAgo: 152,
    },
    {
        id: 'mon-api',
        name: 'API gateway',
        kind: 'http',
        target: 'https://api.phirepass.com/v1/health',
        location: POPS.amsterdam,
        status: 'degraded',
        interval_secs: 60,
        baseLatency: 2140,
        degraded_ms: 1500,
        last_status_code: 200,
        last_error: 'Responded in 2140ms (threshold 1500ms)',
        outageDays: [2, 3],
        outageSeverity: 0.09,
        createdDaysAgo: 121,
    },
    {
        id: 'mon-grafana',
        name: 'Grafana (internal)',
        kind: 'http',
        target: 'http://10.0.4.12:3000/login',
        status: 'down',
        interval_secs: 300,
        baseLatency: null,
        degraded_ms: 2000,
        last_error: 'connect ECONNREFUSED 10.0.4.12:3000',
        outageDays: [0, 1],
        outageSeverity: 1,
        openIncidentMinutesAgo: 158,
        createdDaysAgo: 64,
    },
    {
        id: 'mon-docs',
        name: 'Documentation site',
        kind: 'http',
        target: 'https://docs.phirepass.com',
        location: POPS.ashburn,
        status: 'up',
        interval_secs: 900,
        baseLatency: 156,
        degraded_ms: 1500,
        last_status_code: 200,
        outageDays: [19],
        outageSeverity: 0.22,
        createdDaysAgo: 198,
    },
    {
        id: 'mon-downloads',
        name: 'Agent downloads',
        kind: 'http',
        target: 'https://dl.phirepass.com/agent/latest',
        location: POPS.ashburn,
        status: 'up',
        interval_secs: 900,
        baseLatency: 302,
        degraded_ms: 2500,
        method: 'HEAD',
        expected_status: [200, 302],
        last_status_code: 302,
        createdDaysAgo: 130,
    },
    {
        id: 'mon-tls-apex',
        name: 'phirepass.com certificate',
        kind: 'ssl',
        target: 'phirepass.com:443',
        location: POPS.frankfurt,
        status: 'up',
        interval_secs: 86400,
        baseLatency: 96,
        degraded_ms: 2000,
        expiry_warn_days: 21,
        certExpiresInDays: 68,
        cert_issuer: "Let's Encrypt",
        cert_subject: 'phirepass.com',
        createdDaysAgo: 240,
    },
    {
        id: 'mon-tls-legacy',
        name: 'legacy.phirepass.com certificate',
        kind: 'ssl',
        target: 'legacy.phirepass.com:443',
        location: POPS.ashburn,
        status: 'degraded',
        interval_secs: 86400,
        baseLatency: 132,
        degraded_ms: 2000,
        expiry_warn_days: 21,
        certExpiresInDays: 9,
        cert_issuer: "Let's Encrypt",
        cert_subject: 'legacy.phirepass.com',
        last_error: 'Certificate expires in 9 day(s)',
        createdDaysAgo: 140,
    },
    {
        id: 'mon-tls-staging',
        name: 'staging.phirepass.com certificate',
        kind: 'ssl',
        target: 'staging.phirepass.com:443',
        location: POPS.singapore,
        status: 'down',
        interval_secs: 86400,
        baseLatency: 118,
        degraded_ms: 2000,
        expiry_warn_days: 21,
        certExpiresInDays: -3,
        cert_issuer: 'R11',
        cert_subject: 'staging.phirepass.com',
        last_error: 'Certificate expired 3 day(s) ago',
        outageDays: [0, 1, 2],
        outageSeverity: 1,
        openIncidentMinutesAgo: 4320,
        createdDaysAgo: 92,
    },
    {
        id: 'mon-domain-apex',
        name: 'phirepass.com registration',
        kind: 'domain',
        target: 'phirepass.com',
        status: 'up',
        interval_secs: 86400,
        baseLatency: 412,
        degraded_ms: 5000,
        expiry_warn_days: 30,
        domainExpiresInDays: 214,
        domain_registrar: 'Namecheap, Inc.',
        createdDaysAgo: 240,
    },
    {
        id: 'mon-domain-dev',
        name: 'phirepass.dev registration',
        kind: 'domain',
        target: 'phirepass.dev',
        status: 'degraded',
        interval_secs: 86400,
        baseLatency: 508,
        degraded_ms: 5000,
        expiry_warn_days: 30,
        domainExpiresInDays: 16,
        domain_registrar: 'Google Domains',
        last_error: 'Domain expires in 16 day(s)',
        createdDaysAgo: 175,
    },
    {
        id: 'mon-domain-io',
        name: 'phirepass.io registration',
        kind: 'domain',
        target: 'phirepass.io',
        status: 'unknown',
        interval_secs: 86400,
        baseLatency: null,
        degraded_ms: 5000,
        expiry_warn_days: 30,
        last_error: 'RDAP lookup timed out after 10000ms',
        createdDaysAgo: 58,
    },
    {
        id: 'mon-status',
        name: 'Public status page',
        kind: 'http',
        target: 'https://status.phirepass.com',
        location: POPS.singapore,
        status: 'paused',
        interval_secs: 900,
        baseLatency: 210,
        degraded_ms: 1500,
        last_status_code: 200,
        paused: true,
        createdDaysAgo: 47,
    },
];

function buildDaily(spec: MonitorSpec, random: () => number, now: number): DailyBucket[] {
    const perDay = Math.max(1, Math.min(288, Math.round(DAY_MS / (spec.interval_secs * 1000))));
    const outages = new Set(spec.outageDays ?? []);
    const series: DailyBucket[] = [];

    for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
        const date = new Date(now - offset * DAY_MS);
        const day = date.toISOString().slice(0, 10);

        // A monitor younger than this day simply has no history for it, which is
        // what keeps the strip honest instead of showing a fabricated green run.
        if (offset > spec.createdDaysAgo) {
            series.push({ day, uptime_pct: null, checks: 0, down_checks: 0, avg_latency_ms: null });
            continue;
        }

        if (spec.status === 'unknown') {
            series.push({ day, uptime_pct: null, checks: 0, down_checks: 0, avg_latency_ms: null });
            continue;
        }

        const severity = outages.has(offset) ? (spec.outageSeverity ?? 0.3) : 0;
        const down = Math.round(perDay * severity);
        const latency = spec.baseLatency === null
            ? null
            : Math.max(1, Math.round(spec.baseLatency * (0.82 + random() * 0.36)));

        series.push({
            day,
            uptime_pct: ((perDay - down) / perDay) * 100,
            checks: perDay,
            down_checks: down,
            avg_latency_ms: latency,
        });
    }

    return series;
}

function windowFrom(daily: DailyBucket[], days: number): UptimeWindow {
    const slice = daily.slice(-days);
    const checks = slice.reduce((sum, day) => sum + day.checks, 0);
    const down = slice.reduce((sum, day) => sum + day.down_checks, 0);
    const latencies = slice
        .map((day) => day.avg_latency_ms)
        .filter((value): value is number => value !== null);

    return {
        uptime_pct: checks === 0 ? null : ((checks - down) / checks) * 100,
        avg_latency_ms: latencies.length === 0
            ? null
            : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
        checks,
        down_checks: down,
    };
}

function isoOrNull(now: number, days: number | undefined): string | null {
    return days === undefined ? null : new Date(now + days * DAY_MS).toISOString();
}

function specToMonitor(spec: MonitorSpec, now: number): MonitorSummary {
    const random = seededRandom(hashSeed(spec.id));
    const daily = buildDaily(spec, random, now);

    const lastLatency = spec.baseLatency === null
        ? null
        : Math.round(spec.baseLatency * (0.9 + random() * 0.2));

    // A paused monitor's "last checked" is when it was paused, not a moment ago.
    const lastCheckedMinutesAgo = spec.paused
        ? 1440 + Math.round(random() * 720)
        : Math.round((spec.interval_secs / 60) * (0.15 + random() * 0.7));

    return {
        id: spec.id,
        name: spec.name,
        kind: spec.kind,
        target: spec.target,
        interval_secs: spec.interval_secs,
        timeout_ms: 10_000,
        method: spec.method ?? 'GET',
        expected_status: spec.expected_status ?? [],
        keyword: spec.keyword ?? null,
        keyword_mode: 'contains',
        follow_redirects: true,
        degraded_ms: spec.degraded_ms,
        expiry_warn_days: spec.expiry_warn_days ?? 21,
        paused: spec.paused ?? false,
        created_at: new Date(now - spec.createdDaysAgo * DAY_MS).toISOString(),
        updated_at: new Date(now - Math.round(spec.createdDaysAgo / 2) * DAY_MS).toISOString(),

        last_status: spec.paused ? 'up' : spec.status,
        last_checked_at: new Date(now - lastCheckedMinutesAgo * 60_000).toISOString(),
        last_latency_ms: spec.status === 'down' ? null : lastLatency,
        last_status_code: spec.last_status_code ?? null,
        last_error: spec.last_error ?? null,

        cert_expires_at: isoOrNull(now, spec.certExpiresInDays),
        cert_issuer: spec.cert_issuer ?? null,
        cert_subject: spec.cert_subject ?? null,
        domain_expires_at: isoOrNull(now, spec.domainExpiresInDays),
        domain_registrar: spec.domain_registrar ?? null,

        location: spec.location ?? null,

        window_24h: windowFrom(daily, 1),
        window_7d: windowFrom(daily, 7),
        window_30d: windowFrom(daily, 30),
        daily,
        open_incident_since: spec.openIncidentMinutesAgo === undefined
            ? null
            : new Date(now - spec.openIncidentMinutesAgo * 60_000).toISOString(),
    };
}

export function createMockMonitors(now: number = Date.now()): MonitorSummary[] {
    return SPECS.map((spec) => specToMonitor(spec, now));
}

/**
 * Per-monitor history for the detail dialog: a run of individual checks plus the
 * incidents they imply. Derived from the monitor so an edit or a simulated
 * re-check is reflected here too.
 */
export function createMockDetail(monitor: MonitorSummary, now: number = Date.now()): MonitorDetail {
    const random = seededRandom(hashSeed(`${monitor.id}:detail`));
    const points = monitor.kind === 'ssl' || monitor.kind === 'domain' ? 30 : 90;
    const step = monitor.interval_secs * 1000;

    const checks: CheckPoint[] = [];
    for (let index = points - 1; index >= 0; index--) {
        const checkedAt = new Date(now - index * step).toISOString();

        if (monitor.last_status === 'unknown') {
            checks.push({
                checked_at: checkedAt,
                status: 'unknown',
                latency_ms: null,
                status_code: null,
                error: monitor.last_error,
            });
            continue;
        }

        // The most recent stretch carries the monitor's current state; before
        // that it mostly behaved, with occasional blips.
        const recent = index < (monitor.last_status === 'down' ? 32 : 3);
        const blip = !recent && random() < 0.04;

        const status: MonitorStatus = recent
            ? (monitor.last_status ?? 'up')
            : blip
                ? 'degraded'
                : 'up';

        const base = monitor.last_latency_ms ?? monitor.window_24h.avg_latency_ms ?? 120;
        const latency = status === 'down'
            ? null
            : Math.max(1, Math.round(base * (blip ? 1.9 : 0.78 + random() * 0.44)));

        checks.push({
            checked_at: checkedAt,
            status,
            latency_ms: latency,
            status_code: monitor.kind === 'http' ? (status === 'down' ? null : 200) : null,
            error: status === 'down'
                ? monitor.last_error
                : status === 'degraded'
                    ? `Responded in ${latency}ms (threshold ${monitor.degraded_ms}ms)`
                    : null,
        });
    }

    const incidents: Incident[] = [];
    if (monitor.open_incident_since) {
        incidents.push({
            id: `${monitor.id}-incident-open`,
            monitor_id: monitor.id,
            started_at: monitor.open_incident_since,
            resolved_at: null,
            cause: monitor.last_error,
            status_code: null,
        });
    }

    // A couple of historical, resolved incidents on any monitor that has had a
    // bad day in the last month.
    monitor.daily
        .filter((day) => day.down_checks > 0)
        .slice(-3)
        .forEach((day, index) => {
            const started = new Date(`${day.day}T09:12:00Z`).getTime();
            if (started >= now) return;
            const minutes = 12 + Math.round(random() * 90);
            incidents.push({
                id: `${monitor.id}-incident-${index}`,
                monitor_id: monitor.id,
                started_at: new Date(started).toISOString(),
                resolved_at: new Date(started + minutes * 60_000).toISOString(),
                cause: monitor.kind === 'http'
                    ? 'Unexpected status 502'
                    : 'Handshake failed',
                status_code: monitor.kind === 'http' ? 502 : null,
            });
        });

    incidents.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    return { monitor, checks, incidents };
}

/** A blank monitor for the "create" flow, filled in from the form's input. */
export function createMockMonitorFromInput(
    input: Pick<MonitorSummary,
        'name' | 'kind' | 'target' | 'interval_secs' | 'timeout_ms' | 'method'
        | 'expected_status' | 'keyword' | 'keyword_mode' | 'follow_redirects'
        | 'degraded_ms' | 'expiry_warn_days' | 'paused'>,
    now: number = Date.now()
): MonitorSummary {
    const emptyWindow: UptimeWindow = {
        uptime_pct: null,
        avg_latency_ms: null,
        checks: 0,
        down_checks: 0,
    };

    const daily: DailyBucket[] = [];
    for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
        daily.push({
            day: new Date(now - offset * DAY_MS).toISOString().slice(0, 10),
            uptime_pct: null,
            checks: 0,
            down_checks: 0,
            avg_latency_ms: null,
        });
    }

    return {
        ...input,
        id: `mon-${Math.random().toString(36).slice(2, 10)}`,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        last_status: null,
        last_checked_at: null,
        last_latency_ms: null,
        last_status_code: null,
        last_error: null,
        cert_expires_at: null,
        cert_issuer: null,
        cert_subject: null,
        domain_expires_at: null,
        domain_registrar: null,
        // A monitor that has never run has resolved nothing, so it has no
        // location until its first check.
        location: null,
        window_24h: emptyWindow,
        window_7d: emptyWindow,
        window_30d: emptyWindow,
        daily,
        open_incident_since: null,
    };
}
