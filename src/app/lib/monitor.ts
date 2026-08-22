import { query } from '@/app/lib/db';
import { HISTORY_DAYS, buildDaily, windowFrom } from '@/lib/uptime-window';
import type {
    CheckPoint,
    DailyBucket,
    Incident,
    KeywordMode,
    MonitorDetail,
    MonitorKind,
    MonitorStatus,
    MonitorSummary,
} from '@/types/monitor';

/**
 * Read side of the uptime API: everything that turns rows into the
 * `MonitorSummary` / `MonitorDetail` shapes the dashboard expects.
 *
 * Lives here rather than in the route handlers because the list endpoint and the
 * detail endpoint need the same assembly, and two copies of the uptime maths
 * would drift.
 */

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
    unknown_checks: number;
    degraded_checks: number;
    avg_latency_ms: number | null;
}

/** `timestamptz` arrives from `pg` as a `Date`; the wire contract is ISO strings. */
function iso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
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
 * Worst first: down, degraded, unknown, up, paused — the same order the summary
 * endpoint uses, so a panel's headline and the first card on the page it links
 * to name the same monitor.
 */
const SEVERITY = `
    CASE WHEN m.paused THEN 4
         WHEN m.last_status = 'down' THEN 0
         WHEN m.last_status = 'degraded' THEN 1
         WHEN m.last_status IS NULL OR m.last_status = 'unknown' THEN 2
         ELSE 3
    END`;

const EFFECTIVE_STATUS = `
    CASE WHEN m.paused THEN 'paused'
         ELSE COALESCE(m.last_status, 'unknown')
    END`;

/** Ceiling on one page, so a hand-written `limit` cannot ask for everything. */
const MAX_PAGE_SIZE = 100;

export interface MonitorPageFilters {
    kind?: MonitorKind;
    /** An effective status, i.e. `paused` beats whatever was last recorded. */
    status?: MonitorStatus;
    /** Matched against name, target and agent name. */
    search?: string;
    limit: number;
    offset: number;
}

/**
 * Builds the summaries for an already-chosen set of monitor rows.
 *
 * Split out from selection because the expensive part — thirty days of check
 * history per monitor — is now scoped to whatever the caller selected. That is
 * the whole point of paginating: the list endpoint aggregates history for one
 * page of monitors, not for the entire fleet.
 */
async function summarize(userId: string, rows: MonitorRow[]): Promise<MonitorSummary[]> {
    if (rows.length === 0) {
        return [];
    }

    const ids = rows.map((row) => row.id);
    const params = [userId, ids];

    // Counts come back from `pg` as strings (bigint), so every aggregate is cast
    // to int in SQL rather than parsed here.
    const daily = await query(
        `SELECT c.monitor_id,
                to_char(date_trunc('day', c.checked_at), 'YYYY-MM-DD') AS day,
                count(*)::int                                       AS checks,
                count(*) FILTER (WHERE c.status = 'down')::int       AS down_checks,
                count(*) FILTER (WHERE c.status = 'unknown')::int    AS unknown_checks,
                count(*) FILTER (WHERE c.status = 'degraded')::int   AS degraded_checks,
                round(avg(c.latency_ms))::int                        AS avg_latency_ms
        FROM monitor_checks c
        JOIN monitors m ON m.id = c.monitor_id
        WHERE m.user_id = $1
          AND c.monitor_id = ANY($2::uuid[])
          AND c.checked_at >= date_trunc('day', now()) - make_interval(days => ${HISTORY_DAYS - 1})
        GROUP BY 1, 2`,
        params,
    );

    const incidents = await query(
        `SELECT i.monitor_id, i.started_at
        FROM monitor_incidents i
        JOIN monitors m ON m.id = i.monitor_id
        WHERE m.user_id = $1
          AND i.monitor_id = ANY($2::uuid[])
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

/** One monitor, or null when it is not owned by `userId`. */
export async function loadMonitorById(
    userId: string,
    monitorId: string,
): Promise<MonitorSummary | null> {
    const monitors = await query(
        `SELECT m.*, n.name AS node_name
        FROM monitors m
        JOIN nodes n ON n.id = m.node_id
        WHERE m.user_id = $1 AND m.id = $2`,
        [userId, monitorId],
    );

    const [summary] = await summarize(userId, monitors.rows as MonitorRow[]);
    return summary ?? null;
}

/**
 * One page of monitors, worst first, plus the total the pager needs.
 *
 * Filtering and ordering happen in SQL rather than in the browser, so the client
 * never receives monitors it is not about to draw. The count is a second query
 * over the same predicate — cheaper than a window function here, since the page
 * itself already has to fan out into history and incidents.
 */
export async function loadMonitorPage(
    userId: string,
    filters: MonitorPageFilters,
): Promise<{ monitors: MonitorSummary[]; total: number }> {
    const conditions: string[] = ['m.user_id = $1'];
    const params: unknown[] = [userId];

    if (filters.kind) {
        params.push(filters.kind);
        conditions.push(`m.kind = $${params.length}`);
    }

    if (filters.status) {
        params.push(filters.status);
        conditions.push(`${EFFECTIVE_STATUS} = $${params.length}`);
    }

    if (filters.search) {
        // Escaped before it becomes a LIKE pattern: an unescaped `%` in a search
        // box would silently match everything.
        const pattern = `%${filters.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
        params.push(pattern);
        const placeholder = `$${params.length}`;
        conditions.push(
            `(m.name ILIKE ${placeholder} OR m.target ILIKE ${placeholder} OR n.name ILIKE ${placeholder})`,
        );
    }

    const where = conditions.join(' AND ');

    const counted = await query(
        `SELECT count(*)::int AS total
        FROM monitors m
        JOIN nodes n ON n.id = m.node_id
        WHERE ${where}`,
        params,
    );

    const total = (counted.rows[0]?.total as number | undefined) ?? 0;
    const limit = Math.min(Math.max(1, filters.limit), MAX_PAGE_SIZE);

    const pageParams = [...params, limit, Math.max(0, filters.offset)];
    const monitors = await query(
        `SELECT m.*, n.name AS node_name
        FROM monitors m
        JOIN nodes n ON n.id = m.node_id
        WHERE ${where}
        ORDER BY ${SEVERITY} ASC, m.name ASC, m.id ASC
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams,
    );

    return {
        monitors: await summarize(userId, monitors.rows as MonitorRow[]),
        total,
    };
}

/** One monitor plus its recent checks and incidents, or null if not owned. */
export async function loadMonitorDetail(
    userId: string,
    monitorId: string,
): Promise<MonitorDetail | null> {
    const monitor = await loadMonitorById(userId, monitorId);
    if (!monitor) {
        return null;
    }

    const checks = await query(
        `SELECT checked_at, status, latency_ms, status_code, error, reason
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
        reason: string | null;
    }[]).map((row): CheckPoint => ({
        checked_at: row.checked_at.toISOString(),
        status: row.status,
        latency_ms: row.latency_ms,
        status_code: row.status_code,
        error: row.error,
        reason: row.reason,
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
