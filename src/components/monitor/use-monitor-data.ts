'use client';

import { useCallback, useMemo } from 'react';

import type { AlertEntry } from '@/components/AlertStrip';
import { usePolledResource } from '@/hooks/use-polled-resource';
import type {
    MonitorKind,
    MonitorKindSummary,
    MonitorListPage,
    MonitorOverview,
    MonitorProblem,
    MonitorStatus,
    MonitorStatusCounts,
} from '@/types/monitor';

import { formatLatency } from './monitor-display';

/**
 * The two reads the monitor pages make.
 *
 * They are separate on purpose. The overview needs counts, not monitors — it
 * used to pull every monitor with its full thirty-day history and reduce the lot
 * in the browser to draw three panels. Now the aggregate is computed in SQL
 * (`/api/monitors/summary`) and the list is paged server-side
 * (`/api/monitors?kind=…&page=…`), so neither page ever holds more rows than it
 * draws.
 */

/** The API answers failures as `{ error }`; fall back if the body is not JSON. */
export async function readError(response: Response, fallback: string): Promise<string> {
    const payload = await response
        .json()
        .catch(() => ({ error: fallback })) as { error?: string };
    return payload.error ?? fallback;
}

function emptyCounts(): MonitorStatusCounts {
    return { up: 0, degraded: 0, down: 0, unknown: 0, paused: 0 };
}

/** A kind with no monitors gets no row from the `GROUP BY`; the panel still renders. */
export function emptyKindSummary(kind: MonitorKind): MonitorKindSummary {
    return {
        kind,
        total: 0,
        counts: emptyCounts(),
        uptime_24h_pct: null,
        worst: null,
        next_expiry: null,
    };
}

/**
 * Alert-strip entries for a set of problems the server already selected.
 *
 * The server decides *what* is a problem — it has the whole fleet and a cap;
 * this only decides how each one reads. Takes a list so a per-kind page can pass
 * its own subset: a domain-expiry alert has no business on the HTTP page, where
 * nothing on screen relates to it.
 */
export function alertsFor(problems: MonitorProblem[]): AlertEntry[] {
    const entries: AlertEntry[] = [];

    for (const problem of problems) {
        if (problem.status === 'down') {
            entries.push({
                id: `down-${problem.id}`,
                level: 'error',
                title: `${problem.name} is down`,
                message: problem.last_error ?? 'The last check did not succeed.',
                tag: problem.target,
            });
        } else if (problem.status === 'degraded') {
            // Warning rather than error: the service is answering correctly and
            // only slowly, which is worth seeing on the page and not worth
            // waking anyone for.
            entries.push({
                id: `degraded-${problem.id}`,
                level: 'warning',
                title: `${problem.name} is slow`,
                message: problem.last_error
                    ?? `Responding above the ${formatLatency(problem.degraded_ms)} threshold.`,
                tag: problem.target,
            });
        }

        // A monitor can be both down and expiring; both lines are worth having,
        // and their ids differ so they never collide in the strip.
        if (problem.expiry) {
            const noun = problem.expiry.kind === 'certificate' ? 'Certificate' : 'Domain';
            entries.push({
                id: `expiry-${problem.id}`,
                level: problem.expiry.days <= 7 ? 'error' : 'warning',
                title: problem.expiry.days < 0
                    ? `${noun} for ${problem.name} has expired`
                    : `${noun} for ${problem.name} expires in ${problem.expiry.days} day${problem.expiry.days === 1 ? '' : 's'}`,
                message: problem.expiry.kind === 'certificate'
                    ? 'Renew before it lapses or clients will start refusing the connection.'
                    : 'Renew the registration before it lapses; recovery after expiry is not guaranteed.',
                tag: problem.target,
            });
        }
    }

    return entries;
}

export interface MonitorOverviewData {
    overview: MonitorOverview | null;
    summaryFor: (kind: MonitorKind) => MonitorKindSummary;
    alerts: AlertEntry[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/**
 * The overview aggregate. One small response, whatever the fleet size.
 *
 * `kind` narrows it to a single group and adds that group's problem list, which
 * is what a kind page's alert strip and filter chips need. The unscoped overview
 * asks for neither, so the server never computes them.
 */
export function useMonitorOverview(kind?: MonitorKind): MonitorOverviewData {
    const load = useCallback(async () => {
        const url = kind
            ? `/api/monitors/summary?kind=${encodeURIComponent(kind)}`
            : '/api/monitors/summary';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(await readError(response, 'Failed to load monitors'));
        }
        return await response.json() as MonitorOverview;
    }, [kind]);

    const { data, loading, error, refresh } = usePolledResource(load, {
        errorMessage: 'Failed to load monitors',
    });

    const overview = data ?? null;

    const byKind = useMemo(() => {
        const map = new Map<MonitorKind, MonitorKindSummary>();
        for (const summary of overview?.kinds ?? []) {
            map.set(summary.kind, summary);
        }
        return map;
    }, [overview]);

    const summaryFor = useCallback(
        (kind: MonitorKind) => byKind.get(kind) ?? emptyKindSummary(kind),
        [byKind],
    );

    const alerts = useMemo(() => alertsFor(overview?.problems ?? []), [overview]);

    return { overview, summaryFor, alerts, loading, error, refresh };
}

export interface MonitorListQuery {
    kind: MonitorKind;
    status?: MonitorStatus;
    search?: string;
    page: number;
    limit: number;
}

export interface MonitorListData {
    page: MonitorListPage | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/**
 * One page of monitors.
 *
 * `usePolledResource` re-runs whenever `load` changes identity, so a new filter
 * or page refetches immediately — and because only the first load sets
 * `loading`, changing pages updates in place rather than flashing a skeleton.
 */
export function useMonitorList(queryParams: MonitorListQuery): MonitorListData {
    const { kind, status, search, page, limit } = queryParams;

    const load = useCallback(async () => {
        const params = new URLSearchParams({
            kind,
            page: String(page),
            limit: String(limit),
        });
        if (status) params.set('status', status);
        if (search) params.set('q', search);

        const response = await fetch(`/api/monitors?${params.toString()}`);
        if (!response.ok) {
            throw new Error(await readError(response, 'Failed to load monitors'));
        }
        return await response.json() as MonitorListPage;
    }, [kind, status, search, page, limit]);

    const { data, loading, error, refresh } = usePolledResource(load, {
        errorMessage: 'Failed to load monitors',
    });

    return { page: data ?? null, loading, error, refresh };
}
