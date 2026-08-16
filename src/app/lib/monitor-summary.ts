import { query } from '@/app/lib/db';
import type {
    MonitorKind,
    MonitorKindSummary,
    MonitorOverview,
    MonitorProblem,
    MonitorStatus,
    MonitorStatusCounts,
} from '@/types/monitor';

/**
 * The overview aggregate, computed entirely in SQL.
 *
 * The landing page used to fetch every monitor with its full thirty-day history
 * and reduce it in the browser — tens of thousands of rows grouped per render to
 * draw three summary panels. Everything here is a `GROUP BY` or a `DISTINCT ON`
 * instead, so the payload is a fixed handful of rows no matter how many monitors
 * a user owns.
 *
 * The trade this accepts, deliberately: the overview's numbers and the per-kind
 * list are now two separate queries and can be a poll apart. They are counts of
 * the same rows from the same database, so they converge within one interval,
 * and being briefly off by one is worth not shipping a user's entire monitor
 * history to render a panel.
 */

/** The alert strip is a summary; past this many problems it says "and more". */
const PROBLEM_LIMIT = 50;

/**
 * A monitor's status as the dashboard reckons it: paused wins over whatever it
 * last recorded, and a monitor that has never reported is `unknown` rather than
 * null.
 *
 * Written once here because four queries below order or filter by it, and a
 * second definition that drifted would let the panels disagree with the list.
 */
const EFFECTIVE_STATUS = `
    CASE WHEN m.paused THEN 'paused'
         ELSE COALESCE(m.last_status, 'unknown')
    END`;

/** Worst first, matching the client's ordering: down, degraded, unknown, up, paused. */
const SEVERITY = `
    CASE WHEN m.paused THEN 4
         WHEN m.last_status = 'down' THEN 0
         WHEN m.last_status = 'degraded' THEN 1
         WHEN m.last_status IS NULL OR m.last_status = 'unknown' THEN 2
         ELSE 3
    END`;

/** Whichever clock this monitor is running down. Certificates take precedence. */
const EXPIRES_AT = `COALESCE(m.cert_expires_at, m.domain_expires_at)`;

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyCounts(): MonitorStatusCounts {
    return { up: 0, degraded: 0, down: 0, unknown: 0, paused: 0 };
}

function daysUntil(at: Date, now: number): number {
    return Math.floor((at.getTime() - now) / DAY_MS);
}

interface TallyRow {
    kind: MonitorKind;
    total: number;
    up: number;
    degraded: number;
    down: number;
    unknown: number;
    paused: number;
}

interface UptimeRow {
    kind: MonitorKind;
    verdicts: number;
    down_checks: number;
}

interface WorstRow {
    kind: MonitorKind;
    id: string;
    name: string;
    status: MonitorStatus;
    last_checked_at: Date | null;
}

interface ExpiryRow {
    kind: MonitorKind;
    id: string;
    name: string;
    expires_at: Date;
    is_cert: boolean;
}

interface ProblemRow {
    id: string;
    kind: MonitorKind;
    name: string;
    target: string;
    status: MonitorStatus;
    last_error: string | null;
    degraded_ms: number;
    expiry_warn_days: number;
    expires_at: Date | null;
    is_cert: boolean;
}

/**
 * The overview aggregate, optionally narrowed to one kind.
 *
 * Unscoped is what `/dashboard/monitors` asks for: counts and headlines for every
 * kind, and **no problems list** — the alert strip lives on the per-kind pages,
 * so computing it here would be a query whose result nothing renders.
 *
 * Scoped is what a kind page asks for: that kind's counts for the filter chips,
 * and that kind's problems for its alert strip.
 */
export async function loadMonitorOverview(
    userId: string,
    kind?: MonitorKind,
): Promise<MonitorOverview> {
    const params: unknown[] = [userId];
    let kindFilter = '';

    if (kind) {
        params.push(kind);
        kindFilter = `AND m.kind = $${params.length}`;
    }

    // Counts come back from `pg` as strings (bigint), so every aggregate is cast
    // to int in SQL rather than parsed here.
    const tallies = await query(
        `SELECT m.kind,
                count(*)::int                                                      AS total,
                count(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'up')::int            AS up,
                count(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'degraded')::int      AS degraded,
                count(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'down')::int          AS down,
                count(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'unknown')::int       AS unknown,
                count(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'paused')::int        AS paused
        FROM monitors m
        WHERE m.user_id = $1 ${kindFilter}
        GROUP BY m.kind`,
        params,
    );

    // Pooled over checks rather than averaged over monitors — see the note on
    // `MonitorKindSummary.uptime_24h_pct`. `unknown` is excluded from the
    // denominator so "we could not tell" is never credited as uptime.
    const uptime = await query(
        `SELECT m.kind,
                count(*) FILTER (WHERE c.status <> 'unknown')::int AS verdicts,
                count(*) FILTER (WHERE c.status = 'down')::int     AS down_checks
        FROM monitor_checks c
        JOIN monitors m ON m.id = c.monitor_id
        WHERE m.user_id = $1 ${kindFilter}
          AND c.checked_at >= now() - interval '24 hours'
        GROUP BY m.kind`,
        params,
    );

    const worst = await query(
        `SELECT DISTINCT ON (m.kind)
                m.kind, m.id, m.name, m.last_checked_at,
                ${EFFECTIVE_STATUS} AS status
        FROM monitors m
        WHERE m.user_id = $1 ${kindFilter}
        ORDER BY m.kind, ${SEVERITY} ASC, m.name ASC`,
        params,
    );

    const expiries = await query(
        `SELECT DISTINCT ON (m.kind)
                m.kind, m.id, m.name,
                ${EXPIRES_AT}                     AS expires_at,
                (m.cert_expires_at IS NOT NULL)   AS is_cert
        FROM monitors m
        WHERE m.user_id = $1 ${kindFilter}
          AND ${EXPIRES_AT} IS NOT NULL
        ORDER BY m.kind, ${EXPIRES_AT} ASC`,
        params,
    );

    // Skipped entirely when unscoped: the alert strip lives on the per-kind
    // pages, so the overview would be paying for rows nothing renders.
    //
    // A paused monitor raises no down/degraded alert — it is not being checked —
    // but its certificate expires on schedule regardless, so the expiry arm
    // deliberately does not filter on `paused`.
    const problemRows = kind
        ? (await query(
            `SELECT m.id, m.kind, m.name, m.target, m.last_error, m.degraded_ms,
                    m.expiry_warn_days,
                    ${EFFECTIVE_STATUS}               AS status,
                    ${EXPIRES_AT}                     AS expires_at,
                    (m.cert_expires_at IS NOT NULL)   AS is_cert
            FROM monitors m
            WHERE m.user_id = $1 ${kindFilter}
              AND (
                  (NOT m.paused AND m.last_status IN ('down', 'degraded'))
                  OR (
                      ${EXPIRES_AT} IS NOT NULL
                      AND ${EXPIRES_AT} <= now() + make_interval(days => m.expiry_warn_days)
                  )
              )
            ORDER BY ${SEVERITY} ASC, ${EXPIRES_AT} ASC NULLS LAST, m.name ASC
            LIMIT ${PROBLEM_LIMIT + 1}`,
            params,
        )).rows as ProblemRow[]
        : [];

    const now = Date.now();

    const uptimeByKind = new Map<MonitorKind, number | null>(
        (uptime.rows as UptimeRow[]).map((row) => [
            row.kind,
            row.verdicts > 0 ? ((row.verdicts - row.down_checks) / row.verdicts) * 100 : null,
        ]),
    );

    const worstByKind = new Map<MonitorKind, WorstRow>(
        (worst.rows as WorstRow[]).map((row) => [row.kind, row]),
    );

    const expiryByKind = new Map<MonitorKind, ExpiryRow>(
        (expiries.rows as ExpiryRow[]).map((row) => [row.kind, row]),
    );

    const totals = emptyCounts();
    let total = 0;

    const kinds: MonitorKindSummary[] = (tallies.rows as TallyRow[]).map((row) => {
        const counts: MonitorStatusCounts = {
            up: row.up,
            degraded: row.degraded,
            down: row.down,
            unknown: row.unknown,
            paused: row.paused,
        };

        total += row.total;
        for (const key of Object.keys(totals) as (keyof MonitorStatusCounts)[]) {
            totals[key] += counts[key];
        }

        const worstRow = worstByKind.get(row.kind);
        const expiryRow = expiryByKind.get(row.kind);

        return {
            kind: row.kind,
            total: row.total,
            counts,
            uptime_24h_pct: uptimeByKind.get(row.kind) ?? null,
            // Suppressed when the head of the group is healthy: there is no
            // worst one worth naming, and naming a healthy monitor next to a
            // status word reads as an alert.
            worst: worstRow && worstRow.status !== 'up' && worstRow.status !== 'paused'
                ? {
                    id: worstRow.id,
                    name: worstRow.name,
                    status: worstRow.status,
                    last_checked_at: worstRow.last_checked_at?.toISOString() ?? null,
                }
                : null,
            next_expiry: expiryRow
                ? {
                    id: expiryRow.id,
                    name: expiryRow.name,
                    kind: expiryRow.is_cert ? 'certificate' : 'domain',
                    expires_at: expiryRow.expires_at.toISOString(),
                    days: daysUntil(expiryRow.expires_at, now),
                }
                : null,
        };
    });

    const truncated = problemRows.length > PROBLEM_LIMIT;

    return {
        total,
        counts: totals,
        kinds,
        problems: problemRows.slice(0, PROBLEM_LIMIT).map((row): MonitorProblem => {
            const withinWarning = row.expires_at !== null
                && daysUntil(row.expires_at, now) <= row.expiry_warn_days;

            return {
                id: row.id,
                kind: row.kind,
                name: row.name,
                target: row.target,
                status: row.status,
                last_error: row.last_error,
                degraded_ms: row.degraded_ms,
                expiry: withinWarning && row.expires_at
                    ? {
                        id: row.id,
                        name: row.name,
                        kind: row.is_cert ? 'certificate' : 'domain',
                        expires_at: row.expires_at.toISOString(),
                        days: daysUntil(row.expires_at, now),
                    }
                    : null,
            };
        }),
        problems_truncated: truncated,
    };
}
