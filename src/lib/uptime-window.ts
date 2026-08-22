import type { DailyBucket, UptimeWindow } from '@/types/monitor';

/**
 * How a pile of per-day check counts becomes the numbers a monitor card shows.
 *
 * Split out of `monitor.ts` — which is the Postgres read side — because demo
 * mode assembles the same shapes from generated history and must reach exactly
 * the same verdicts. Nothing here touches a database, so importing it never
 * opens a connection.
 */

/** Days of history a monitor carries; the detail dialog's strip draws all of them. */
export const HISTORY_DAYS = 30;

/** One day's tallies, however they were counted. */
export interface DailyCounts {
    /** `YYYY-MM-DD`, UTC. */
    day: string;
    checks: number;
    down_checks: number;
    unknown_checks: number;
    degraded_checks: number;
    avg_latency_ms: number | null;
}

/**
 * The 30 calendar days ending today, oldest first, with days that recorded
 * nothing left empty rather than absent — the strip draws one bar per entry and
 * a no-data day must render neutral, not vanish.
 */
export function buildDaily(rows: DailyCounts[], now: Date): DailyBucket[] {
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const buckets: DailyBucket[] = [];

    for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - offset);
        const day = date.toISOString().slice(0, 10);
        const row = byDay.get(day);

        const checks = row?.checks ?? 0;
        const downChecks = row?.down_checks ?? 0;
        const unknownChecks = row?.unknown_checks ?? 0;
        const degradedChecks = row?.degraded_checks ?? 0;
        // Only checks that reached a verdict can score. A day of agent timeouts
        // has checks > 0 and verdicts === 0, which is `null` uptime rather than
        // a perfect day.
        const verdicts = checks - unknownChecks;

        buckets.push({
            day,
            checks,
            down_checks: downChecks,
            unknown_checks: unknownChecks,
            degraded_checks: degradedChecks,
            avg_latency_ms: row?.avg_latency_ms ?? null,
            uptime_pct: verdicts > 0 ? ((verdicts - downChecks) / verdicts) * 100 : null,
        });
    }

    return buckets;
}

/**
 * Sums the trailing `days` buckets.
 *
 * `checks` counts everything that ran, so a timeout still shows up as a check —
 * but `unknown` is subtracted before the percentage is worked out, so "we could
 * not tell" is never credited as uptime. A day of nothing but timeouts reports
 * `checks: N`, `unknown_checks: N`, and `uptime_pct: null`.
 */
export function windowFrom(daily: DailyBucket[], days: number): UptimeWindow {
    const slice = daily.slice(-days);
    const checks = slice.reduce((sum, day) => sum + day.checks, 0);
    const down = slice.reduce((sum, day) => sum + day.down_checks, 0);
    const unknown = slice.reduce((sum, day) => sum + day.unknown_checks, 0);
    const degraded = slice.reduce((sum, day) => sum + day.degraded_checks, 0);
    const verdicts = checks - unknown;
    const latencies = slice
        .map((day) => day.avg_latency_ms)
        .filter((value): value is number => value !== null);

    return {
        uptime_pct: verdicts === 0 ? null : ((verdicts - down) / verdicts) * 100,
        avg_latency_ms: latencies.length === 0
            ? null
            : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
        checks,
        down_checks: down,
        unknown_checks: unknown,
        degraded_checks: degraded,
    };
}
