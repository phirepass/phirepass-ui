import { query } from '@/app/lib/db';
import type {
    CheckPoint,
    DailyBucket,
    Incident,
    KeywordMode,
    MonitorDetail,
    MonitorKind,
    MonitorStatus,
    MonitorSummary,
    UptimeWindow,
} from '@/types/monitor';

/**
 * Read side of the uptime API: everything that turns rows into the
 * `MonitorSummary` / `MonitorDetail` shapes the dashboard expects.
 *
 * Lives here rather than in the route handlers because the list endpoint and the
 * detail endpoint need the same assembly, and two copies of the uptime maths
 * would drift.
 */

const HISTORY_DAYS = 30;

/** Individual checks returned with a monitor's detail. */
const DETAIL_CHECK_LIMIT = 200;
const DETAIL_INCIDENT_LIMIT = 50;

interface MonitorRow {
    id: string;
    node_id: string;
    node_name: string | null;
    name: string;
    kind: MonitorKind;
    target: string;
    interval_secs: number;
    timeout_ms: number;
    method: string;
    expected_status: number[] | null;
    keyword: string | null;
    keyword_mode: KeywordMode;
    follow_redirects: boolean;
    degraded_ms: number;
    expiry_warn_days: number;
    paused: boolean;
    agent_offline_is_outage: boolean;
    last_status: MonitorStatus | null;
    last_checked_at: Date | null;
    last_latency_ms: number | null;
    last_status_code: number | null;
    last_error: string | null;
    cert_expires_at: Date | null;
    cert_issuer: string | null;
    cert_subject: string | null;
    domain_expires_at: Date | null;
    domain_registrar: string | null;
    location: unknown;
    created_at: Date;
    updated_at: Date;
}

interface DailyRow {
    monitor_id: string;
    day: string;
    checks: number;
    down_checks: number;
    avg_latency_ms: number | null;
}

/** `timestamptz` arrives from `pg` as a `Date`; the wire contract is ISO strings. */
function iso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

/**
 * The 30 calendar days ending today, oldest first, with days that recorded
 * nothing left empty rather than absent — the strip draws one bar per entry and
 * a no-data day must render neutral, not vanish.
 */
function buildDaily(rows: DailyRow[], now: Date): DailyBucket[] {
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const buckets: DailyBucket[] = [];

    for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - offset);
        const day = date.toISOString().slice(0, 10);
        const row = byDay.get(day);

        buckets.push({
            day,
            checks: row?.checks ?? 0,
            down_checks: row?.down_checks ?? 0,
            avg_latency_ms: row?.avg_latency_ms ?? null,
            uptime_pct: row && row.checks > 0
                ? ((row.checks - row.down_checks) / row.checks) * 100
                : null,
        });
    }

    return buckets;
}

/**
 * Sums the trailing `days` buckets.
 *
 * `checks` deliberately counts only checks that reached a verdict — the SQL
 * excludes `unknown` — so this arithmetic never credits "we could not tell" as
 * uptime. The consequence is that a day where the agent was offline throughout
 * reports `checks: 0` and renders as no-data, which is honest: nothing was
 * learned about the target that day.
 */
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

function toSummary(
    row: MonitorRow,
    daily: DailyBucket[],
    openIncidentSince: Date | null,
): MonitorSummary {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        target: row.target,
        interval_secs: row.interval_secs,
        timeout_ms: row.timeout_ms,
        method: row.method,
        expected_status: row.expected_status ?? [],
        keyword: row.keyword,
        keyword_mode: row.keyword_mode,
        follow_redirects: row.follow_redirects,
        degraded_ms: row.degraded_ms,
        expiry_warn_days: row.expiry_warn_days,
        paused: row.paused,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),

        node_id: row.node_id,
        node_name: row.node_name,
        agent_offline_is_outage: row.agent_offline_is_outage,

        last_status: row.last_status,
        last_checked_at: iso(row.last_checked_at),
        last_latency_ms: row.last_latency_ms,
        last_status_code: row.last_status_code,
        last_error: row.last_error,

        cert_expires_at: iso(row.cert_expires_at),
        cert_issuer: row.cert_issuer,
        cert_subject: row.cert_subject,
        domain_expires_at: iso(row.domain_expires_at),
        domain_registrar: row.domain_registrar,

        location: (row.location ?? null) as MonitorSummary['location'],

        window_24h: windowFrom(daily, 1),
        window_7d: windowFrom(daily, 7),
        window_30d: windowFrom(daily, 30),
        daily,
        open_incident_since: iso(openIncidentSince),
    };
}

/**
 * Every monitor owned by `userId`, or just `monitorId` when given.
 *
 * Three queries rather than one join: the per-day aggregate and the open-incident
 * lookup both fan out per monitor, and joining them onto the monitor rows would
 * multiply the result set only to be regrouped in JavaScript.
 *
 * Ownership is enforced in SQL on all three, so a monitor id belonging to
 * somebody else simply returns nothing.
 */
export async function loadMonitors(
    userId: string,
    monitorId?: string,
): Promise<MonitorSummary[]> {
    const scope = monitorId ? 'AND m.id = $2' : '';
    const params = monitorId ? [userId, monitorId] : [userId];

    const monitors = await query(
        `SELECT m.*, n.name AS node_name
        FROM monitors m
        JOIN nodes n ON n.id = m.node_id
        WHERE m.user_id = $1 ${scope}
        ORDER BY m.created_at DESC`,
        params,
    );

    const rows = monitors.rows as MonitorRow[];
    if (rows.length === 0) {
        return [];
    }

    // Counts come back from `pg` as strings (bigint), so every aggregate is cast
    // to int in SQL rather than parsed here.
    const daily = await query(
        `SELECT c.monitor_id,
                to_char(date_trunc('day', c.checked_at), 'YYYY-MM-DD') AS day,
                count(*) FILTER (WHERE c.status <> 'unknown')::int AS checks,
                count(*) FILTER (WHERE c.status = 'down')::int       AS down_checks,
                round(avg(c.latency_ms))::int                        AS avg_latency_ms
        FROM monitor_checks c
        JOIN monitors m ON m.id = c.monitor_id
        WHERE m.user_id = $1 ${scope}
          AND c.checked_at >= date_trunc('day', now()) - make_interval(days => ${HISTORY_DAYS - 1})
        GROUP BY 1, 2`,
        params,
    );

    const incidents = await query(
        `SELECT i.monitor_id, i.started_at
        FROM monitor_incidents i
        JOIN monitors m ON m.id = i.monitor_id
        WHERE m.user_id = $1 ${scope}
          AND i.resolved_at IS NULL`,
        params,
    );

    const dailyByMonitor = new Map<string, DailyRow[]>();
    for (const row of daily.rows as DailyRow[]) {
        const list = dailyByMonitor.get(row.monitor_id) ?? [];
        list.push(row);
        dailyByMonitor.set(row.monitor_id, list);
    }

    const openByMonitor = new Map<string, Date>(
        (incidents.rows as { monitor_id: string; started_at: Date }[])
            .map((row) => [row.monitor_id, row.started_at]),
    );

    const now = new Date();
    return rows.map((row) => toSummary(
        row,
        buildDaily(dailyByMonitor.get(row.id) ?? [], now),
        openByMonitor.get(row.id) ?? null,
    ));
}

/** One monitor plus its recent checks and incidents, or null if not owned. */
export async function loadMonitorDetail(
    userId: string,
    monitorId: string,
): Promise<MonitorDetail | null> {
    const [monitor] = await loadMonitors(userId, monitorId);
    if (!monitor) {
        return null;
    }

    const checks = await query(
        `SELECT checked_at, status, latency_ms, status_code, error
        FROM monitor_checks
        WHERE monitor_id = $1
        ORDER BY checked_at DESC
        LIMIT ${DETAIL_CHECK_LIMIT}`,
        [monitorId],
    );

    const incidents = await query(
        `SELECT id, monitor_id, started_at, resolved_at, cause, status_code
        FROM monitor_incidents
        WHERE monitor_id = $1
        ORDER BY started_at DESC
        LIMIT ${DETAIL_INCIDENT_LIMIT}`,
        [monitorId],
    );

    const points = (checks.rows as {
        checked_at: Date;
        status: MonitorStatus;
        latency_ms: number | null;
        status_code: number | null;
        error: string | null;
    }[]).map((row): CheckPoint => ({
        checked_at: row.checked_at.toISOString(),
        status: row.status,
        latency_ms: row.latency_ms,
        status_code: row.status_code,
        error: row.error,
    }));

    return {
        monitor,
        // Queried newest-first so the LIMIT keeps the most recent checks, then
        // reversed: the dialog's chart plots left-to-right in time order.
        checks: points.reverse(),
        incidents: (incidents.rows as {
            id: string;
            monitor_id: string;
            started_at: Date;
            resolved_at: Date | null;
            cause: string | null;
            status_code: number | null;
        }[]).map((row): Incident => ({
            id: row.id,
            monitor_id: row.monitor_id,
            started_at: row.started_at.toISOString(),
            resolved_at: iso(row.resolved_at),
            cause: row.cause,
            status_code: row.status_code,
        })),
    };
}
