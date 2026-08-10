'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    Plus,
    RadioTower,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { AlertStrip, type AlertEntry } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { FilterChips, SearchBar } from '@/components/SearchBar';
import { StatTiles } from '@/components/StatTiles';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MonitorCard } from './MonitorCard';
import { MonitorDetailDialog } from './MonitorDetailDialog';
import { MonitorFormDialog } from './MonitorFormDialog';
import { effectiveStatus, expiryFor } from './monitor-display';
import { createMockMonitorFromInput, createMockMonitors } from '@/data/mockMonitors';
import { MONITOR_KIND_LABELS, type MonitorInput, type MonitorSummary } from '@/types/uptime';

const MONITORS_PER_PAGE = 6;

/**
 * Stands in for the round trip a real backend would cost, so the loading and
 * saving states are actually visible while the page is being reviewed.
 */
const FAKE_LATENCY_MS = 420;

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

type StatusFilter = 'all' | 'up' | 'degraded' | 'down' | 'paused';

export default function UptimePage() {
    const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<MonitorSummary | null>(null);
    const [detailMonitorId, setDetailMonitorId] = useState<string | null>(null);
    const [monitorToDelete, setMonitorToDelete] = useState<MonitorSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [checkingId, setCheckingId] = useState<string | null>(null);

    // Seeded after mount rather than in the initial state: the sample history is
    // built relative to the current time, and generating it during render would
    // produce different timestamps on the server than in the browser.
    useEffect(() => {
        let disposed = false;

        const seed = async () => {
            await sleep(FAKE_LATENCY_MS);
            if (disposed) return;
            setMonitors(createMockMonitors());
            setLoading(false);
        };

        void seed();
        return () => {
            disposed = true;
        };
    }, []);

    const detailMonitor = detailMonitorId
        ? monitors.find((monitor) => monitor.id === detailMonitorId) ?? null
        : null;

    const counts = useMemo(() => {
        const tally = { up: 0, degraded: 0, down: 0, paused: 0, unknown: 0 };
        for (const monitor of monitors) {
            tally[effectiveStatus(monitor)] += 1;
        }
        return tally;
    }, [monitors]);

    const expiringSoon = useMemo(
        () => monitors
            .map((monitor) => ({ monitor, expiry: expiryFor(monitor) }))
            .filter((entry) => entry.expiry !== null && entry.expiry.days <= entry.monitor.expiry_warn_days),
        [monitors]
    );

    const alerts = useMemo<AlertEntry[]>(() => {
        const entries: AlertEntry[] = [];

        for (const monitor of monitors) {
            if (effectiveStatus(monitor) === 'down') {
                entries.push({
                    id: `down-${monitor.id}`,
                    level: 'error',
                    title: `${monitor.name} is down`,
                    message: monitor.last_error ?? 'The last check did not succeed.',
                    tag: monitor.target,
                });
            }
        }

        for (const { monitor, expiry } of expiringSoon) {
            if (!expiry) continue;
            entries.push({
                id: `expiry-${monitor.id}`,
                level: expiry.days <= 7 ? 'error' : 'warning',
                title: expiry.days < 0
                    ? `${expiry.kind === 'certificate' ? 'Certificate' : 'Domain'} for ${monitor.name} has expired`
                    : `${expiry.kind === 'certificate' ? 'Certificate' : 'Domain'} for ${monitor.name} expires in ${expiry.days} day${expiry.days === 1 ? '' : 's'}`,
                message: expiry.kind === 'certificate'
                    ? 'Renew before it lapses or clients will start refusing the connection.'
                    : 'Renew the registration before it lapses; recovery after expiry is not guaranteed.',
                tag: monitor.target,
            });
        }

        return entries;
    }, [monitors, expiringSoon]);

    const filteredMonitors = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();
        const severity: Record<string, number> = { down: 0, degraded: 1, unknown: 2, up: 3, paused: 4 };

        return monitors
            .filter((monitor) => filter === 'all' || effectiveStatus(monitor) === filter)
            .filter((monitor) => {
                if (!needle) return true;
                return (
                    monitor.name.toLowerCase().includes(needle)
                    || monitor.target.toLowerCase().includes(needle)
                    || MONITOR_KIND_LABELS[monitor.kind].toLowerCase().includes(needle)
                );
            })
            // Worst first: the thing that needs attention should never be on page 2.
            .sort((a, b) => {
                const delta = severity[effectiveStatus(a)] - severity[effectiveStatus(b)];
                if (delta !== 0) return delta;
                return a.name.localeCompare(b.name);
            });
    }, [monitors, filter, searchQuery]);

    const pageCount = Math.max(1, Math.ceil(filteredMonitors.length / MONITORS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pagedMonitors = filteredMonitors.slice(
        (clampedPage - 1) * MONITORS_PER_PAGE,
        clampedPage * MONITORS_PER_PAGE
    );

    const submitMonitor = async (input: MonitorInput): Promise<boolean> => {
        const isEdit = !!editing;
        await sleep(FAKE_LATENCY_MS);

        const fields = {
            name: input.name,
            kind: input.kind,
            target: input.target,
            interval_secs: input.interval_secs ?? 300,
            timeout_ms: input.timeout_ms ?? 10_000,
            method: input.method ?? 'GET',
            expected_status: input.expected_status ?? [],
            keyword: input.keyword ?? null,
            keyword_mode: input.keyword_mode ?? ('contains' as const),
            follow_redirects: input.follow_redirects ?? true,
            degraded_ms: input.degraded_ms ?? 1500,
            expiry_warn_days: input.expiry_warn_days ?? 21,
            paused: input.paused ?? false,
        };

        if (isEdit) {
            const id = editing.id;
            setMonitors((prev) => prev.map((monitor) => (
                monitor.id === id
                    ? { ...monitor, ...fields, updated_at: new Date().toISOString() }
                    : monitor
            )));
        } else {
            // A brand-new monitor has no history, which is what the empty strip
            // and the em-dashes in its stats are meant to convey.
            setMonitors((prev) => [createMockMonitorFromInput(fields), ...prev]);
        }

        toast.success(isEdit ? 'Monitor updated' : 'Monitor created');
        setFormOpen(false);
        setEditing(null);
        return true;
    };

    /**
     * Simulates a probe: nudges the recorded latency and stamps the check time,
     * keeping the monitor's status as-is. Nothing leaves the browser.
     */
    const checkNow = useCallback(async (monitor: MonitorSummary) => {
        setCheckingId(monitor.id);
        await sleep(FAKE_LATENCY_MS);

        setMonitors((prev) => prev.map((entry) => {
            if (entry.id !== monitor.id) return entry;

            const base = entry.last_latency_ms ?? entry.window_24h.avg_latency_ms;
            return {
                ...entry,
                last_checked_at: new Date().toISOString(),
                last_latency_ms: base === null
                    ? null
                    : Math.max(1, Math.round(base * (0.85 + Math.random() * 0.3))),
            };
        }));

        setCheckingId(null);
        toast.success(`Checked ${monitor.name}`);
    }, []);

    const togglePause = (monitor: MonitorSummary) => {
        setMonitors((prev) => prev.map((entry) => (
            entry.id === monitor.id ? { ...entry, paused: !entry.paused } : entry
        )));
        toast.success(monitor.paused ? 'Monitor resumed' : 'Monitor paused');
    };

    const deleteMonitor = async (monitor: MonitorSummary) => {
        setDeleting(true);
        await sleep(FAKE_LATENCY_MS);
        setMonitors((prev) => prev.filter((entry) => entry.id !== monitor.id));
        setDeleting(false);
        setMonitorToDelete(null);
        toast.success('Monitor deleted');
    };

    const addButton = (
        <Button
            size="sm"
            className="gap-2 w-fit"
            onClick={() => {
                setEditing(null);
                setFormOpen(true);
            }}
        >
            <Plus className="h-4 w-4" />
            Add Monitor
        </Button>
    );

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <PageHeader
                title="Uptime"
                description="Watch HTTP endpoints, TCP ports, TLS certificates, and domain registrations"
                badge={
                    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning">
                        dev preview
                    </span>
                }
                actions={addButton}
            />

            <StatTiles
                tiles={[
                    { label: 'Monitors', value: monitors.length, icon: RadioTower, tone: 'accent' },
                    { label: 'Up', value: counts.up, icon: CheckCircle2, tone: 'success' },
                    { label: 'Degraded', value: counts.degraded, icon: AlertTriangle, tone: 'warning' },
                    { label: 'Down', value: counts.down, icon: XCircle, tone: 'danger' },
                ]}
            />

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Loading monitors...</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    <SearchBar
                        value={searchQuery}
                        onChange={(value) => {
                            setSearchQuery(value);
                            setPage(1);
                        }}
                        placeholder="Search monitors..."
                        aria-label="Search monitors by name, target, or kind"
                    >
                        <FilterChips<StatusFilter>
                            label="Filter monitors by status"
                            value={filter}
                            onChange={(value) => {
                                setFilter(value);
                                setPage(1);
                            }}
                            options={[
                                { value: 'all', label: 'All', count: monitors.length },
                                { value: 'down', label: 'Down', count: counts.down },
                                { value: 'degraded', label: 'Degraded', count: counts.degraded },
                                { value: 'up', label: 'Up', count: counts.up },
                                { value: 'paused', label: 'Paused', count: counts.paused },
                            ]}
                        />
                    </SearchBar>

                    {filteredMonitors.length === 0 ? (
                        <EmptyState
                            icon={Activity}
                            title={monitors.length === 0 ? 'No monitors yet' : 'No monitors match this view'}
                            description={
                                monitors.length === 0
                                    ? 'Add a URL, a TLS endpoint, or a domain and the scheduler starts checking it right away.'
                                    : 'Try a different search term or clear the status filter.'
                            }
                            action={monitors.length === 0 ? addButton : null}
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {pagedMonitors.map((monitor) => (
                                    <MonitorCard
                                        key={monitor.id}
                                        monitor={monitor}
                                        checking={checkingId === monitor.id}
                                        onOpen={(target) => setDetailMonitorId(target.id)}
                                        onCheckNow={(target) => void checkNow(target)}
                                        onTogglePause={togglePause}
                                        onEdit={(target) => {
                                            setEditing(target);
                                            setFormOpen(true);
                                        }}
                                        onDelete={setMonitorToDelete}
                                    />
                                ))}
                            </div>

                            <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
                        </>
                    )}
                </>
            )}

            {formOpen ? (
                <MonitorFormDialog
                    key={editing?.id ?? 'new'}
                    monitor={editing}
                    onClose={() => {
                        setFormOpen(false);
                        setEditing(null);
                    }}
                    onSubmit={submitMonitor}
                />
            ) : null}

            {detailMonitor ? (
                <MonitorDetailDialog
                    key={detailMonitor.id}
                    monitor={detailMonitor}
                    onClose={() => setDetailMonitorId(null)}
                    onCheckNow={checkNow}
                />
            ) : null}

            <AlertDialog open={!!monitorToDelete} onOpenChange={(open) => !open && setMonitorToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete monitor</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete &ldquo;{monitorToDelete?.name}&rdquo;? Its check history and incident record are
                            removed with it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                if (monitorToDelete) void deleteMonitor(monitorToDelete);
                            }}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Deleting...' : 'Delete monitor'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Expiry roll-up: the reason someone opens this page on a quiet week. */}
            {!loading && expiringSoon.length > 0 ? (
                <div className="rounded-xl border border-border gradient-card p-5">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <CalendarClock className="h-4 w-4 text-warning" />
                        Upcoming expiries
                    </h2>
                    <div className="space-y-2">
                        {expiringSoon
                            .slice()
                            .sort((a, b) => (a.expiry?.days ?? 0) - (b.expiry?.days ?? 0))
                            .map(({ monitor, expiry }) => (
                                <div
                                    key={monitor.id}
                                    className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{monitor.name}</p>
                                        <p className="truncate font-mono text-xs text-muted-foreground">
                                            {monitor.target}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-medium text-warning tabular-nums">
                                            {expiry && expiry.days < 0 ? 'expired' : `${expiry?.days}d left`}
                                        </p>
                                        <p className="text-xs capitalize text-muted-foreground">{expiry?.kind}</p>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
