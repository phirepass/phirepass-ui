import { buildDaily, windowFrom, type DailyCounts } from '@/lib/uptime-window';
import type { ParsedMonitor } from '@/app/lib/monitor-input';
import type { UserInfo } from '@/app/lib/types';
import type {
    CheckPoint,
    DailyBucket,
    Incident,
    MonitorDetail,
    MonitorKind,
    MonitorOverview,
    MonitorProblem,
    MonitorStatus,
    MonitorStatusCounts,
    MonitorSummary,
    MonitorKindSummary,
} from '@/types/monitor';
import type { NodeStats, TunnelNode } from '@/types/node';
import type { PatToken } from '@/types/pat-token';

import {
    DEMO_MONITOR_SPECS,
    DEMO_NODE_SPECS,
    DEMO_TOKEN_SPECS,
    DEMO_USER,
    type DemoMonitorSpec,
    type DemoNodeSpec,
    type DemoServiceSpec,
} from './fixtures';

/**
 * The demo's whole backend: one process-local fleet, materialised on every read.
 *
 * Two rules run through all of it.
 *
 * **Nothing is stored with a timestamp.** The fixtures describe a fleet in
 * relative terms — "enrolled 96 days ago", "the outage was nine days back at
 * 21:00", "this certificate has four days left" — and every wire object is
 * assembled against the clock at read time. A demo given tomorrow tells the same
 * story as one given today, and a tab left open over lunch does not come back
 * showing a fleet last checked two hours ago.
 *
 * **Mutations are real, within the process.** Renaming a node, creating a
 * monitor, pausing one, revoking a token — all of it lands in this store and is
 * reflected by the next poll, because a demo where nothing can be clicked is a
 * screenshot. It is per-process and lives only in memory: a restart, or a second
 * replica, is a fresh fleet. That is deliberate, and the reason demo mode must
 * never be enabled on a deployment anyone depends on.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Days of history the check list and the strip cover. Matches `HISTORY_DAYS`. */
const HISTORY_DAYS = 30;
/** Matches `DETAIL_CHECK_LIMIT` in `monitor.ts`, which the detail dialog pages through. */
const CHECK_LIMIT = 200;
const INCIDENT_LIMIT = 50;
/** Mirrors `PROBLEM_LIMIT` / `PANEL_HISTORY_DAYS` in `monitor-summary.ts`. */
const PROBLEM_LIMIT = 50;
const PANEL_HISTORY_DAYS = 14;
/** How long ago a monitor the fixtures ship as paused was paused. */
const PAUSED_SINCE_DAYS = 4;

/** Worst first: down, degraded, unknown, up, paused — the order the SQL uses. */
const SEVERITY: Record<MonitorStatus, number> = {
    down: 0,
    degraded: 1,
    unknown: 2,
    up: 3,
    paused: 4,
};

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/**
 * FNV-1a. Every varying number in the demo — a CPU reading, a response time —
 * is a pure function of a string key, so two requests a second apart agree and
 * the fleet never flickers between polls.
 */
function hash(text: string): number {
    let value = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        value ^= text.charCodeAt(i);
        value = Math.imul(value, 0x01000193);
    }
    return value >>> 0;
}

/** The hash, spread over [0, 1). */
function noise(key: string): number {
    let x = hash(key);
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
}

/**
 * A smooth walk in [-1, 1] for live gauges.
 *
 * Two out-of-phase sines rather than random draws: a CPU meter that jumps to an
 * unrelated value every poll looks like a broken UI, while a value that drifts
 * looks like a machine doing work.
 */
function drift(key: string, nowMs: number, periodSecs: number): number {
    const phase = noise(key) * Math.PI * 2;
    const t = nowMs / 1000;
    return (
        Math.sin(t / periodSecs + phase) * 0.7
        + Math.sin(t / (periodSecs * 0.37) + phase * 1.9) * 0.3
    );
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function utcMidnight(nowMs: number): number {
    const date = new Date(nowMs);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
}

function dayKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function daysUntil(atMs: number, nowMs: number): number {
    return Math.floor((atMs - nowMs) / DAY_MS);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A fixture monitor plus the few facts that only exist once the demo is running. */
export interface DemoMonitorState extends DemoMonitorSpec {
    /** Absolute creation instant; set for monitors created during the demo. */
    created_at_ms?: number;
    /** When it was paused, so pausing one on screen does not rewrite its history. */
    paused_since_ms?: number;
    /** Set by "check now": one synthetic check at that instant. */
    forced_check_at_ms?: number;
    updated_at_ms?: number;
}

interface DemoState {
    startedAt: number;
    nodes: DemoNodeSpec[];
    monitors: DemoMonitorState[];
    tokens: PatToken[];
}

/**
 * Held on `globalThis` so the fleet survives a dev-server hot reload — otherwise
 * every edit while presenting would silently roll back whatever was clicked.
 */
const STATE_KEY = Symbol.for('phirepass.demo.state');

type StateHolder = { [STATE_KEY]?: DemoState };

function initialState(): DemoState {
    const now = Date.now();

    return {
        startedAt: now,
        nodes: DEMO_NODE_SPECS.map((node) => ({ ...node })),
        monitors: DEMO_MONITOR_SPECS.map((monitor) => ({
            ...monitor,
            paused_since_ms: monitor.paused ? now - PAUSED_SINCE_DAYS * DAY_MS : undefined,
        })),
        tokens: DEMO_TOKEN_SPECS.map((token) => ({
            id: token.id,
            token_id: token.token_id,
            name: token.name,
            scopes: ['server:register'],
            created_at: new Date(now - token.created_days_ago * DAY_MS).toISOString(),
            expires_at: token.expires_in_days === null
                ? null
                : new Date(now + token.expires_in_days * DAY_MS).toISOString(),
            last_used_at: token.last_used_hours_ago === null
                ? null
                : new Date(now - token.last_used_hours_ago * HOUR_MS).toISOString(),
            status: token.expires_in_days !== null && token.expires_in_days < 0 ? 'expired' : 'active',
        })),
    };
}

function state(): DemoState {
    const holder = globalThis as StateHolder;
    if (!holder[STATE_KEY]) {
        holder[STATE_KEY] = initialState();
    }
    return holder[STATE_KEY];
}

/**
 * The identity behind the sample fleet, for `GET /api/profile`.
 *
 * Not part of the mutable state: there is nothing in the dashboard that edits a
 * profile, so this stays a constant rather than a fixture that pretends to be
 * one.
 */
export function demoUser(): UserInfo {
    return { ...DEMO_USER };
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

type ServiceSummary = number | { visibility: 'public' | 'private'; count: number };

/**
 * The same collapse `/api/nodes` performs on an agent's service list: one entry
 * per kind, with HTTP additionally carrying whether any instance is public.
 */
function summarizeServices(services: DemoServiceSpec[]): Record<string, ServiceSummary> {
    const summary: Record<string, ServiceSummary> = {};

    for (const service of services) {
        const existing = summary[service.kind];
        if (service.kind === 'HTTP') {
            const previous = typeof existing === 'object' ? existing : null;
            summary.HTTP = {
                count: (previous?.count ?? 0) + 1,
                visibility: previous?.visibility === 'public' || service.visibility === 'public'
                    ? 'public'
                    : 'private',
            };
        } else {
            summary[service.kind] = (typeof existing === 'number' ? existing : 0) + 1;
        }
    }

    return summary;
}

/**
 * Live metrics for an online node.
 *
 * Offline and connecting nodes get zeros for everything sampled per heartbeat,
 * exactly as the real route does when Redis holds no `stats` field — the card
 * then renders its "no telemetry" state rather than a plausible-looking lie
 * about a machine that is not reporting.
 */
function buildStats(node: DemoNodeSpec, nowMs: number): NodeStats {
    const live = node.status === 'online';

    const cpu = live
        ? clamp(node.cpu + drift(`${node.id}:cpu`, nowMs, 97) * 11, 1, 99)
        : 0;
    const memUsed = live
        ? node.mem_total_bytes * clamp(node.mem_used + drift(`${node.id}:mem`, nowMs, 211) * 0.04, 0.05, 0.97)
        : 0;
    const loadScale = live ? 1 + drift(`${node.id}:load`, nowMs, 143) * 0.25 : 0;

    const disks = live || node.status === 'connecting'
        ? node.disks.map((disk) => ({
            mount: disk.mount,
            fs_type: disk.fs_type,
            total_bytes: disk.total_bytes,
            // Free space, not `total - used`: on unix the two differ by the
            // root-reserved blocks, which is the number the card shows.
            available_bytes: Math.round(disk.total_bytes * (1 - disk.used) * 0.97),
        }))
        : [];

    const diskTotal = disks.reduce((sum, disk) => sum + disk.total_bytes, 0);
    const diskUsed = disks.reduce((sum, disk) => sum + (disk.total_bytes - disk.available_bytes), 0);

    // Static identity survives an agent that has authenticated but not yet
    // heartbeated, because it arrives with the auth frame rather than the
    // heartbeat — hence `connecting` keeping its host fields.
    const known = node.status !== 'offline';

    return {
        ip: known ? node.location.ip : '',
        host_connections: live ? Math.round(node.connections * (1 + drift(`${node.id}:conn`, nowMs, 61) * 0.18)) : 0,
        host_cpu: Math.round(cpu * 10) / 10,
        host_disks: disks,
        host_disk_total_bytes: diskTotal,
        host_disk_used_bytes: diskUsed,
        host_ip: known ? node.location.ip : '',
        host_local_ip: known ? node.host_local_ip : '',
        host_load_average: [
            Math.round(node.load_average[0] * loadScale * 100) / 100,
            Math.round(node.load_average[1] * loadScale * 100) / 100,
            Math.round(node.load_average[2] * loadScale * 100) / 100,
        ],
        host_mac: known ? node.host_mac : '',
        host_mem_total_bytes: known ? node.mem_total_bytes : 0,
        host_mem_used_bytes: Math.round(memUsed),
        host_name: known ? node.host_name : node.name,
        host_os_info: known ? node.host_os_info : '',
        host_processes: live ? node.processes : 0,
        // Counts up in real time, so a fleet watched for ten minutes has been up
        // ten minutes longer.
        host_uptime_secs: live
            ? Math.round(node.uptime_days * 86_400 + (nowMs - state().startedAt) / 1000)
            : 0,
        version: known ? node.version : '',
    };
}

function toTunnelNode(node: DemoNodeSpec, nowMs: number, monitorCounts: Map<string, number>): TunnelNode {
    const known = node.status !== 'offline';

    return {
        id: node.id,
        name: node.name,
        ip: known ? node.location.ip : '',
        server_id: node.id,
        connected_for_secs: node.status === 'online'
            ? Math.round(node.connected_hours * 3_600 + (nowMs - state().startedAt) / 1000)
            : 0,
        is_online: node.status === 'online',
        status: node.status,
        stats: buildStats(node, nowMs),
        info: known
            ? {
                proc_id: String(1000 + (hash(node.id) % 60_000)),
                version: node.version,
                host_name: node.host_name,
                host_ip: node.location.ip,
                host_local_ip: node.host_local_ip,
                host_mac: node.host_mac,
                host_os_info: node.host_os_info,
                public: node.location,
                lan: node.lan,
                created_at: Math.floor((nowMs - node.enrolled_days_ago * DAY_MS) / 1000),
            }
            : null,
        services: summarizeServices(node.services),
        monitor_count: monitorCounts.get(node.id) ?? 0,
    };
}

function monitorCountsByNode(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const monitor of state().monitors) {
        counts.set(monitor.node_id, (counts.get(monitor.node_id) ?? 0) + 1);
    }
    return counts;
}

/** `GET /api/nodes`, optionally narrowed to one node. */
export function demoNodes(requestedId?: string | null): TunnelNode[] {
    const now = Date.now();
    const counts = monitorCountsByNode();

    return state().nodes
        .filter((node) => !requestedId || node.id === requestedId)
        .map((node) => toTunnelNode(node, now, counts));
}

/** `GET /api/nodes/services`; null when the node is not in the fleet. */
export function demoNodeServices(nodeId: string, kind?: string): DemoServiceSpec[] | null {
    const node = state().nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return null;

    const wanted = kind?.trim().toUpperCase();
    // Passwords are never invented here, not even fake ones: the edit dialog
    // renders an empty field, which is also what it does for a real service
    // whose secret the API declines to return.
    return node.services.filter((service) => !wanted || service.kind === wanted);
}

export function renameDemoNode(id: string, name: string): 'ok' | 'not-found' | 'duplicate' {
    const nodes = state().nodes;
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) return 'not-found';

    const taken = nodes.some(
        (candidate) => candidate.id !== id && candidate.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (taken) return 'duplicate';

    node.name = name;
    return 'ok';
}

/** Deleting a node takes its monitors with it, as the real cascade does. */
export function deleteDemoNode(id: string): boolean {
    const current = state();
    const index = current.nodes.findIndex((node) => node.id === id);
    if (index === -1) return false;

    current.nodes.splice(index, 1);
    current.monitors = current.monitors.filter((monitor) => monitor.node_id !== id);
    return true;
}

// ---------------------------------------------------------------------------
// Monitors
// ---------------------------------------------------------------------------

interface Materialized {
    summary: MonitorSummary;
    checks: CheckPoint[];
    incidents: Incident[];
}

interface Window {
    start: number;
    end: number;
    cause: string;
    status_code: number | null;
}

/**
 * Turns a fixture's "nine days ago at 21:00, for 12 minutes" into an absolute
 * range.
 *
 * A negative hour on day zero means "that many hours before now", which is how
 * an open incident stays a plausible age however late in the day the demo runs.
 */
function absoluteWindow(daysAgo: number, startHour: number, durationMins: number | null, nowMs: number) {
    const start = daysAgo === 0 && startHour < 0
        ? nowMs + startHour * HOUR_MS
        : utcMidnight(nowMs) - daysAgo * DAY_MS + startHour * HOUR_MS;

    return {
        start,
        end: durationMins === null ? Number.POSITIVE_INFINITY : start + durationMins * 60_000,
    };
}

function outageWindows(spec: DemoMonitorState, nowMs: number): Window[] {
    return spec.outages.map((outage) => ({
        ...absoluteWindow(outage.days_ago, outage.start_hour, outage.duration_mins, nowMs),
        cause: outage.cause,
        status_code: outage.status_code,
    }));
}

function blindWindows(spec: DemoMonitorState, nowMs: number): Window[] {
    return spec.blind.map((blind) => ({
        ...absoluteWindow(blind.days_ago, blind.start_hour, blind.duration_mins, nowMs),
        // The agent could not be reached, so nothing was learned about the
        // target — `unknown`, and excluded from the uptime denominator.
        cause: 'Agent offline when the check was due',
        status_code: null,
    }));
}

function slowdownWindows(spec: DemoMonitorState, nowMs: number): (Window & { latency_ms: number })[] {
    return spec.slowdowns.map((slowdown) => ({
        ...absoluteWindow(slowdown.days_ago, slowdown.start_hour, slowdown.duration_mins, nowMs),
        cause: '',
        status_code: null,
        latency_ms: slowdown.latency_ms,
    }));
}

function covering<T extends Window>(windows: T[], at: number): T | null {
    return windows.find((window) => at >= window.start && at < window.end) ?? null;
}

/**
 * Whichever clock this monitor runs down, in absolute terms.
 *
 * Nudged a few hours past the whole day so that "four days left" survives the
 * floor the UI applies to the difference — landing exactly on the boundary
 * would render as three.
 */
function expiryAt(spec: DemoMonitorState, nowMs: number): { at: number; isCert: boolean } | null {
    const offset = 6 * HOUR_MS;

    if (spec.cert_expires_in_days !== undefined) {
        return { at: nowMs + spec.cert_expires_in_days * DAY_MS + offset, isCert: true };
    }
    if (spec.domain_expires_in_days !== undefined) {
        return { at: nowMs + spec.domain_expires_in_days * DAY_MS + offset, isCert: false };
    }
    return null;
}

function createdAtMs(spec: DemoMonitorState, nowMs: number): number {
    return spec.created_at_ms ?? nowMs - spec.created_days_ago * DAY_MS;
}

/**
 * The scheduled check instants for a monitor, newest first.
 *
 * Anchored to a per-monitor phase rather than to `now`, so a 15-minute monitor
 * lands on its own quarter-hours: two monitors do not report as if they were
 * checked in lockstep, and the newest check ages by seconds rather than jumping
 * whenever the page polls.
 */
function scheduleFor(spec: DemoMonitorState, nowMs: number): number[] {
    const interval = spec.interval_secs * 1000;
    const phase = hash(spec.id) % interval;
    const stopAt = Math.max(createdAtMs(spec, nowMs), nowMs - HISTORY_DAYS * DAY_MS);
    // A paused monitor is not being checked; its history stops where it stopped.
    const ceiling = spec.paused ? Math.min(nowMs, spec.paused_since_ms ?? nowMs) : nowMs;

    const instants: number[] = [];
    let at = Math.floor((ceiling - phase) / interval) * interval + phase;
    while (at >= stopAt && instants.length < HISTORY_DAYS * 24 * 4) {
        instants.push(at);
        at -= interval;
    }

    return instants;
}

interface CheckResult {
    status: MonitorStatus;
    latency: number | null;
    statusCode: number | null;
    error: string | null;
    reason: string | null;
}

function resultAt(
    spec: DemoMonitorState,
    at: number,
    outages: Window[],
    blind: Window[],
    slowdowns: (Window & { latency_ms: number })[],
): CheckResult {
    const blinded = covering(blind, at);
    if (blinded) {
        return {
            status: 'unknown',
            latency: null,
            statusCode: null,
            error: blinded.cause,
            reason: 'agent_disconnected',
        };
    }

    const outage = covering(outages, at);
    if (outage) {
        return {
            status: 'down',
            latency: null,
            statusCode: outage.status_code,
            error: outage.cause,
            reason: outage.status_code ? 'unexpected_status' : 'target_unreachable',
        };
    }

    const base = covering(slowdowns, at)?.latency_ms ?? spec.latency_ms ?? 100;
    const key = `${spec.id}:${at}`;

    // Two slow waves plus a little jitter. The response-time chart plots 200
    // consecutive checks, and pure noise around a constant draws as a hairy
    // band that no real service produces — traffic has a daily shape, so the
    // long wave is a day and the short one an afternoon.
    const phase = noise(spec.id) * Math.PI * 2;
    const shape = 1
        + Math.sin(at / (23 * HOUR_MS) + phase) * 0.13
        + Math.sin(at / (3.7 * HOUR_MS) + phase * 1.7) * 0.09;

    // A slow check never happens by chance here: the strip paints a whole day
    // amber for a single degraded check, so a random spike would turn every bar
    // on the overview amber and the scripted slowdowns would stop meaning
    // anything.
    const latency = Math.max(1, Math.round(base * shape * (0.95 + noise(key) * 0.1)));

    return {
        status: latency > spec.degraded_ms ? 'degraded' : 'up',
        latency,
        statusCode: spec.status_code,
        error: latency > spec.degraded_ms
            ? `Responded in ${(latency / 1000).toFixed(1)}s, above the threshold`
            : null,
        reason: null,
    };
}

function materialize(spec: DemoMonitorState, nowMs: number): Materialized {
    const outages = outageWindows(spec, nowMs);
    const blind = blindWindows(spec, nowMs);
    const slowdowns = slowdownWindows(spec, nowMs);
    const instants = scheduleFor(spec, nowMs);

    if (spec.forced_check_at_ms && (instants.length === 0 || spec.forced_check_at_ms > instants[0])) {
        instants.unshift(spec.forced_check_at_ms);
    }

    const perDay = new Map<string, DailyCounts & { latency_total: number; latency_count: number }>();
    const checks: CheckPoint[] = [];
    let newest: CheckResult | null = null;

    for (const at of instants) {
        const result = resultAt(spec, at, outages, blind, slowdowns);
        if (!newest) newest = result;

        const day = dayKey(at);
        let bucket = perDay.get(day);
        if (!bucket) {
            bucket = {
                day,
                checks: 0,
                down_checks: 0,
                unknown_checks: 0,
                degraded_checks: 0,
                avg_latency_ms: null,
                latency_total: 0,
                latency_count: 0,
            };
            perDay.set(day, bucket);
        }

        bucket.checks += 1;
        if (result.status === 'down') bucket.down_checks += 1;
        if (result.status === 'unknown') bucket.unknown_checks += 1;
        if (result.status === 'degraded') bucket.degraded_checks += 1;
        if (result.latency !== null) {
            bucket.latency_total += result.latency;
            bucket.latency_count += 1;
        }

        if (checks.length < CHECK_LIMIT) {
            checks.push({
                checked_at: new Date(at).toISOString(),
                status: result.status,
                latency_ms: result.latency,
                status_code: result.statusCode,
                error: result.error,
                reason: result.reason,
            });
        }
    }

    const dailyRows: DailyCounts[] = [...perDay.values()].map((bucket) => ({
        day: bucket.day,
        checks: bucket.checks,
        down_checks: bucket.down_checks,
        unknown_checks: bucket.unknown_checks,
        degraded_checks: bucket.degraded_checks,
        avg_latency_ms: bucket.latency_count > 0
            ? Math.round(bucket.latency_total / bucket.latency_count)
            : null,
    }));

    const daily = buildDaily(dailyRows, new Date(nowMs));
    const expiry = expiryAt(spec, nowMs);
    const lastCheckedAt = instants.length > 0 ? new Date(instants[0]).toISOString() : null;

    const incidents: Incident[] = spec.outages
        .map((outage, index) => {
            const window = absoluteWindow(outage.days_ago, outage.start_hour, outage.duration_mins, nowMs);
            return {
                id: `${spec.id}-incident-${index}`,
                monitor_id: spec.id,
                started_at: new Date(window.start).toISOString(),
                resolved_at: Number.isFinite(window.end) ? new Date(window.end).toISOString() : null,
                cause: outage.cause,
                status_code: outage.status_code,
            };
        })
        .filter((incident) => Date.parse(incident.started_at) >= nowMs - HISTORY_DAYS * DAY_MS)
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
        .slice(0, INCIDENT_LIMIT);

    const openIncident = incidents.find((incident) => incident.resolved_at === null) ?? null;

    const summary: MonitorSummary = {
        id: spec.id,
        name: spec.name,
        kind: spec.kind,
        target: spec.target,
        interval_secs: spec.interval_secs,
        timeout_ms: spec.timeout_ms,
        method: spec.method,
        expected_status: spec.expected_status,
        keyword: spec.keyword,
        keyword_mode: spec.keyword_mode,
        follow_redirects: spec.follow_redirects,
        degraded_ms: spec.degraded_ms,
        expiry_warn_days: spec.expiry_warn_days,
        paused: spec.paused,
        created_at: new Date(createdAtMs(spec, nowMs)).toISOString(),
        updated_at: new Date(spec.updated_at_ms ?? createdAtMs(spec, nowMs)).toISOString(),

        node_id: spec.node_id,
        node_name: state().nodes.find((node) => node.id === spec.node_id)?.name ?? null,
        agent_offline_is_outage: spec.agent_offline_is_outage,

        last_status: newest?.status ?? null,
        last_checked_at: lastCheckedAt,
        last_latency_ms: newest?.latency ?? null,
        last_status_code: newest?.statusCode ?? null,
        last_error: newest?.error ?? null,

        // Expiry does not change `last_status` here: a certificate inside its
        // warning window surfaces through `next_expiry` and the problems list,
        // which is what the expiry alerts are built from. Marking it `degraded`
        // as well would put "is slow" in the alert strip next to it, which is
        // the wrong sentence about a perfectly fast host.
        cert_expires_at: expiry?.isCert ? new Date(expiry.at).toISOString() : null,
        cert_issuer: spec.cert_issuer ?? null,
        cert_subject: spec.cert_subject ?? null,
        domain_expires_at: expiry && !expiry.isCert ? new Date(expiry.at).toISOString() : null,
        domain_registrar: spec.domain_registrar ?? null,

        location: spec.location,

        window_24h: windowFrom(daily, 1),
        window_7d: windowFrom(daily, 7),
        window_30d: windowFrom(daily, 30),
        daily,
        open_incident_since: openIncident?.started_at ?? null,
    };

    return { summary, checks, incidents };
}

/**
 * Materialisation is cheap but not free — a 15-minute monitor walks 2,880
 * instants — and every page on the dashboard polls every 15 seconds. One
 * second of memoisation makes a poll cost one pass instead of one per monitor
 * per endpoint, while staying far shorter than the poll interval, so nothing on
 * screen is ever visibly stale.
 */
const MEMO_MS = 1_000;
let memo: { at: number; byId: Map<string, Materialized> } | null = null;

function invalidate() {
    memo = null;
}

function materialized(spec: DemoMonitorState): Materialized {
    const now = Date.now();
    if (!memo || now - memo.at > MEMO_MS) {
        memo = { at: now, byId: new Map() };
    }

    const cached = memo.byId.get(spec.id);
    if (cached) return cached;

    const built = materialize(spec, memo.at);
    memo.byId.set(spec.id, built);
    return built;
}

/** Paused beats whatever was last recorded — the `EFFECTIVE_STATUS` of the SQL. */
function effectiveStatus(summary: MonitorSummary): MonitorStatus {
    if (summary.paused) return 'paused';
    return summary.last_status ?? 'unknown';
}

function allSummaries(): MonitorSummary[] {
    return state().monitors.map((spec) => materialized(spec).summary);
}

export interface DemoMonitorFilters {
    kind?: MonitorKind;
    status?: MonitorStatus;
    search?: string;
    limit: number;
    offset: number;
}

export function demoMonitorPage(filters: DemoMonitorFilters): { monitors: MonitorSummary[]; total: number } {
    const search = filters.search?.toLowerCase();

    const matched = allSummaries().filter((monitor) => {
        if (filters.kind && monitor.kind !== filters.kind) return false;
        if (filters.status && effectiveStatus(monitor) !== filters.status) return false;
        if (search) {
            const haystack = `${monitor.name} ${monitor.target} ${monitor.node_name ?? ''}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    matched.sort((a, b) => {
        const bySeverity = SEVERITY[effectiveStatus(a)] - SEVERITY[effectiveStatus(b)];
        if (bySeverity !== 0) return bySeverity;
        const byName = a.name.localeCompare(b.name);
        return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });

    return {
        monitors: matched.slice(filters.offset, filters.offset + filters.limit),
        total: matched.length,
    };
}

function findSpec(monitorId: string): DemoMonitorState | undefined {
    return state().monitors.find((monitor) => monitor.id === monitorId);
}

export function demoMonitorSummary(monitorId: string): MonitorSummary | null {
    const spec = findSpec(monitorId);
    return spec ? materialized(spec).summary : null;
}

export function demoMonitorDetail(monitorId: string): MonitorDetail | null {
    const spec = findSpec(monitorId);
    if (!spec) return null;

    const built = materialized(spec);
    return { monitor: built.summary, checks: built.checks, incidents: built.incidents };
}

export function demoNodeExists(nodeId: string): boolean {
    return state().nodes.some((node) => node.id === nodeId);
}

function specFromInput(input: ParsedMonitor, id: string, nowMs: number): DemoMonitorState {
    return {
        id,
        node_id: input.node_id,
        name: input.name,
        kind: input.kind,
        target: input.target,
        interval_secs: input.interval_secs,
        timeout_ms: input.timeout_ms,
        method: input.method,
        expected_status: input.expected_status,
        keyword: input.keyword,
        keyword_mode: input.keyword_mode,
        follow_redirects: input.follow_redirects,
        degraded_ms: input.degraded_ms,
        expiry_warn_days: input.expiry_warn_days,
        paused: input.paused,
        agent_offline_is_outage: input.agent_offline_is_outage,
        created_days_ago: 0,
        created_at_ms: nowMs,
        updated_at_ms: nowMs,
        paused_since_ms: input.paused ? nowMs : undefined,
        latency_ms: 120,
        status_code: input.kind === 'http' ? 200 : null,
        outages: [],
        blind: [],
        slowdowns: [],
        // Created now, so no scheduled instant falls after it: the monitor has
        // no history and no last check, which is exactly what a real one looks
        // like until the scheduler first picks it up.
        location: null,
    };
}

/** `POST /api/monitors`. The caller has already validated the body. */
export function createDemoMonitor(input: ParsedMonitor): MonitorSummary {
    const now = Date.now();
    // A real id, because the dashboard puts it in URLs and the monitor form
    // validates ids it is given back.
    const spec = specFromInput(input, crypto.randomUUID(), now);

    state().monitors.unshift(spec);
    invalidate();

    return materialized(spec).summary;
}

/** `PATCH /api/monitors/:id`; null when it is not in the demo fleet. */
export function updateDemoMonitor(monitorId: string, input: ParsedMonitor): MonitorSummary | null {
    const spec = findSpec(monitorId);
    if (!spec) return null;

    const now = Date.now();
    const wasPaused = spec.paused;

    Object.assign(spec, {
        node_id: input.node_id,
        name: input.name,
        kind: input.kind,
        target: input.target,
        interval_secs: input.interval_secs,
        timeout_ms: input.timeout_ms,
        method: input.method,
        expected_status: input.expected_status,
        keyword: input.keyword,
        keyword_mode: input.keyword_mode,
        follow_redirects: input.follow_redirects,
        degraded_ms: input.degraded_ms,
        expiry_warn_days: input.expiry_warn_days,
        paused: input.paused,
        agent_offline_is_outage: input.agent_offline_is_outage,
        updated_at_ms: now,
    });

    // Pausing stops the history where it is; resuming lets it run again from
    // now, rather than back-filling checks that never happened.
    if (input.paused && !wasPaused) spec.paused_since_ms = now;
    if (!input.paused) spec.paused_since_ms = undefined;

    invalidate();
    return materialized(spec).summary;
}

export function deleteDemoMonitor(monitorId: string): boolean {
    const current = state();
    const index = current.monitors.findIndex((monitor) => monitor.id === monitorId);
    if (index === -1) return false;

    current.monitors.splice(index, 1);
    invalidate();
    return true;
}

/**
 * "Check now". The real route only brings the next check forward — there is no
 * path from this process to the agent — but in the demo there is no scheduler
 * either, so the result it would have produced is written straight away. It is
 * the one place the demo answers faster than production, and it is what makes
 * "create a monitor, check it, watch it go green" a thing you can show.
 */
export function checkDemoMonitorNow(monitorId: string): 'not-found' | 'paused' | MonitorSummary {
    const spec = findSpec(monitorId);
    if (!spec) return 'not-found';
    if (spec.paused) return 'paused';

    spec.forced_check_at_ms = Date.now();
    invalidate();

    return materialized(spec).summary;
}

// ---------------------------------------------------------------------------
// Monitor overview
// ---------------------------------------------------------------------------

function emptyCounts(): MonitorStatusCounts {
    return { up: 0, degraded: 0, down: 0, unknown: 0, paused: 0 };
}

/** The trailing `PANEL_HISTORY_DAYS`, summed across every monitor of one kind. */
function kindDaily(summaries: MonitorSummary[]): DailyBucket[] {
    const merged = new Map<string, DailyCounts & { latency_total: number; latency_count: number }>();

    for (const summary of summaries) {
        for (const day of summary.daily.slice(-PANEL_HISTORY_DAYS)) {
            let bucket = merged.get(day.day);
            if (!bucket) {
                bucket = {
                    day: day.day,
                    checks: 0,
                    down_checks: 0,
                    unknown_checks: 0,
                    degraded_checks: 0,
                    avg_latency_ms: null,
                    latency_total: 0,
                    latency_count: 0,
                };
                merged.set(day.day, bucket);
            }

            bucket.checks += day.checks;
            bucket.down_checks += day.down_checks;
            bucket.unknown_checks += day.unknown_checks;
            bucket.degraded_checks += day.degraded_checks;
            if (day.avg_latency_ms !== null) {
                // Weighted by the day's checks, so a busy monitor is not
                // averaged flat against an idle one.
                bucket.latency_total += day.avg_latency_ms * day.checks;
                bucket.latency_count += day.checks;
            }
        }
    }

    const rows: DailyCounts[] = [...merged.values()].map((bucket) => ({
        day: bucket.day,
        checks: bucket.checks,
        down_checks: bucket.down_checks,
        unknown_checks: bucket.unknown_checks,
        degraded_checks: bucket.degraded_checks,
        avg_latency_ms: bucket.latency_count > 0 ? Math.round(bucket.latency_total / bucket.latency_count) : null,
    }));

    // `buildDaily` returns 30 days; a panel's strip wants the last 14.
    return buildDaily(rows, new Date()).slice(-PANEL_HISTORY_DAYS);
}

export function demoMonitorOverview(kind?: MonitorKind): MonitorOverview {
    const now = Date.now();
    const all = allSummaries().filter((monitor) => !kind || monitor.kind === kind);

    const byKind = new Map<MonitorKind, MonitorSummary[]>();
    for (const monitor of all) {
        const bucket = byKind.get(monitor.kind);
        if (bucket) bucket.push(monitor);
        else byKind.set(monitor.kind, [monitor]);
    }

    const totals = emptyCounts();
    let total = 0;

    const kinds: MonitorKindSummary[] = [...byKind.entries()].map(([monitorKind, summaries]) => {
        const counts = emptyCounts();
        for (const summary of summaries) {
            counts[effectiveStatus(summary)] += 1;
        }

        total += summaries.length;
        for (const key of Object.keys(totals) as (keyof MonitorStatusCounts)[]) {
            totals[key] += counts[key];
        }

        // Pooled over checks rather than averaged over monitors: a kind holding
        // one busy monitor and nine idle ones should report what happened.
        const verdicts = summaries.reduce(
            (sum, summary) => sum + summary.window_24h.checks - summary.window_24h.unknown_checks,
            0,
        );
        const downChecks = summaries.reduce((sum, summary) => sum + summary.window_24h.down_checks, 0);

        const worst = [...summaries].sort((a, b) => {
            const bySeverity = SEVERITY[effectiveStatus(a)] - SEVERITY[effectiveStatus(b)];
            return bySeverity !== 0 ? bySeverity : a.name.localeCompare(b.name);
        })[0];
        const worstStatus = worst ? effectiveStatus(worst) : 'up';

        const expiring = summaries
            .map((summary) => {
                const at = summary.cert_expires_at ?? summary.domain_expires_at;
                if (!at) return null;
                return {
                    id: summary.id,
                    name: summary.name,
                    kind: (summary.cert_expires_at ? 'certificate' : 'domain') as 'certificate' | 'domain',
                    expires_at: at,
                    days: daysUntil(Date.parse(at), now),
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));

        return {
            kind: monitorKind,
            total: summaries.length,
            counts,
            uptime_24h_pct: verdicts > 0 ? ((verdicts - downChecks) / verdicts) * 100 : null,
            daily: kindDaily(summaries),
            // Suppressed when the head of the group is healthy: naming a healthy
            // monitor next to a status word reads as an alert.
            worst: worst && worstStatus !== 'up' && worstStatus !== 'paused'
                ? {
                    id: worst.id,
                    name: worst.name,
                    status: worstStatus,
                    last_checked_at: worst.last_checked_at,
                }
                : null,
            next_expiry: expiring[0] ?? null,
        };
    });

    // The alert strip lives on the per-kind pages; unscoped, nothing renders a
    // problems list, so none is built.
    const problems: MonitorProblem[] = kind
        ? all
            .filter((summary) => {
                const status = effectiveStatus(summary);
                // A paused monitor raises no down/degraded alert — it is not
                // being checked — but its certificate expires on schedule
                // regardless, so the expiry arm ignores `paused`.
                if (!summary.paused && (status === 'down' || status === 'degraded')) return true;

                const at = summary.cert_expires_at ?? summary.domain_expires_at;
                return at !== null && daysUntil(Date.parse(at), now) <= summary.expiry_warn_days;
            })
            .sort((a, b) => {
                const bySeverity = SEVERITY[effectiveStatus(a)] - SEVERITY[effectiveStatus(b)];
                if (bySeverity !== 0) return bySeverity;
                const aAt = a.cert_expires_at ?? a.domain_expires_at;
                const bAt = b.cert_expires_at ?? b.domain_expires_at;
                if (aAt && bAt) return Date.parse(aAt) - Date.parse(bAt);
                if (aAt) return -1;
                if (bAt) return 1;
                return a.name.localeCompare(b.name);
            })
            .map((summary): MonitorProblem => {
                const at = summary.cert_expires_at ?? summary.domain_expires_at;
                const days = at ? daysUntil(Date.parse(at), now) : null;

                return {
                    id: summary.id,
                    kind: summary.kind,
                    name: summary.name,
                    target: summary.target,
                    status: effectiveStatus(summary),
                    last_error: summary.last_error,
                    degraded_ms: summary.degraded_ms,
                    expiry: at && days !== null && days <= summary.expiry_warn_days
                        ? {
                            id: summary.id,
                            name: summary.name,
                            kind: summary.cert_expires_at ? 'certificate' : 'domain',
                            expires_at: at,
                            days,
                        }
                        : null,
                };
            })
        : [];

    return {
        total,
        counts: totals,
        kinds,
        problems: problems.slice(0, PROBLEM_LIMIT),
        problems_truncated: problems.length > PROBLEM_LIMIT,
    };
}

// ---------------------------------------------------------------------------
// PAT tokens
// ---------------------------------------------------------------------------

/** `GET /api/pat/list`. Expiry is re-derived, so a token can lapse mid-demo. */
export function demoTokens(): PatToken[] {
    const now = Date.now();

    return state().tokens.map((token) => ({
        ...token,
        status: token.expires_at && Date.parse(token.expires_at) < now ? 'expired' : token.status,
    }));
}

/**
 * `POST /api/pat` — the enrolment flow's first step, so the "add a node" dialog
 * has a real-looking token to show and copy.
 *
 * Returns the same `pat_<id>.<secret>` string `create_pat` does: that literal is
 * what the dialog puts in the `phirepass-agent login` line, so it has to look
 * like the thing an operator would actually paste.
 */
export function createDemoToken(name: string, expiresAt: string | null): string {
    const now = Date.now();
    const suffix = (key: string) => {
        const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < 12; i++) {
            out += alphabet[Math.floor(noise(`${key}:${i}`) * alphabet.length)];
        }
        return out;
    };

    const tokenId = suffix(`${name}:${now}`);
    const created: PatToken = {
        id: crypto.randomUUID(),
        token_id: tokenId,
        name,
        scopes: ['server:register'],
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        last_used_at: null,
        status: 'active',
    };

    state().tokens.unshift(created);

    // The secret half is returned once and never kept on the record, which is
    // how the real endpoint behaves — the list can only ever show `token_id`.
    return `pat_${tokenId}.${suffix(`secret:${now}`)}${suffix(`more:${now}`)}`;
}

export function deleteDemoToken(tokenId: string): boolean {
    const current = state();
    const index = current.tokens.findIndex((token) => token.token_id === tokenId);
    if (index === -1) return false;

    current.tokens.splice(index, 1);
    return true;
}
