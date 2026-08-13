'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { effectiveStatus, expiryFor, formatLatency } from './monitor-display';
import { usePolledResource } from '@/hooks/use-polled-resource';
import { MONITOR_KIND_LABELS, type MonitorInput, type MonitorSummary } from '@/types/monitor';

const MONITORS_PER_PAGE = 6;

type StatusFilter = 'all' | 'up' | 'degraded' | 'down' | 'paused';

/** The API answers failures as `{ error }`; fall back if the body is not JSON. */
async function readError(response: Response, fallback: string): Promise<string> {
    const payload = await response
        .json()
        .catch(() => ({ error: fallback })) as { error?: string };
    return payload.error ?? fallback;
}

export default function MonitorPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<MonitorSummary | null>(null);
    const [detailMonitorId, setDetailMonitorId] = useState<string | null>(null);
    const [monitorToDelete, setMonitorToDelete] = useState<MonitorSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [checkingId, setCheckingId] = useState<string | null>(null);

    const loadMonitors = useCallback(async () => {
        const response = await fetch('/api/monitors');
        if (!response.ok) {
            throw new Error(await readError(response, 'Failed to load monitors'));
        }
        const data = await response.json() as { monitors?: MonitorSummary[] };
        return data.monitors ?? [];
    }, []);

    // Results only change as fast as the shortest interval allows (five
    // minutes), so this is about noticing a check that has just landed rather
    // than about live status.
    const {
        data: monitorsData,
        loading,
        error,
        refresh,
    } = usePolledResource(loadMonitors, { errorMessage: 'Failed to load monitors' });

    const monitors = useMemo(() => monitorsData ?? [], [monitorsData]);

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
            const status = effectiveStatus(monitor);

            if (status === 'down') {
                entries.push({
                    id: `down-${monitor.id}`,
                    level: 'error',
                    title: `${monitor.name} is down`,
                    message: monitor.last_error ?? 'The last check did not succeed.',
                    tag: monitor.target,
                });
            } else if (status === 'degraded') {
                // Listed, but at warning rather than error: the service is
                // answering correctly and only slowly, which is worth seeing on
                // the page and not worth waking anyone for.
                entries.push({
                    id: `degraded-${monitor.id}`,
                    level: 'warning',
                    title: `${monitor.name} is slow`,
                    message: monitor.last_error
                        ?? `Responding above the ${formatLatency(monitor.degraded_ms)} threshold.`,
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

    /**
     * Throws on failure so `MonitorFormDialog` can surface the API's own message
     * inside the form, next to the fields that caused it.
     */
    const submitMonitor = async (input: MonitorInput): Promise<boolean> => {
        const isEdit = !!editing;
        const response = await fetch(
            isEdit ? `/api/monitors/${editing.id}` : '/api/monitors',
            {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            },
        );

        if (!response.ok) {
            throw new Error(await readError(
                response,
                isEdit ? 'Failed to update monitor' : 'Failed to create monitor',
            ));
        }

        await refresh();
        toast.success(isEdit ? 'Monitor updated' : 'Monitor created');
        setFormOpen(false);
        setEditing(null);
        return true;
    };

    /**
     * Brings the next check forward. Only a server holding that agent's socket
     * can dispatch a probe, so this returns once the monitor is marked due — the
     * result lands on a later poll, which is why the toast says "queued".
     */
    const checkNow = useCallback(async (monitor: MonitorSummary) => {
        setCheckingId(monitor.id);
        try {
            const response = await fetch(`/api/monitors/${monitor.id}/check`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(await readError(response, 'Failed to queue check'));
            }
            await refresh();
            toast.success(`Check queued for ${monitor.name}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to queue check');
        } finally {
            setCheckingId(null);
        }
    }, [refresh]);

    const togglePause = async (monitor: MonitorSummary) => {
        const paused = !monitor.paused;
        try {
            const response = await fetch(`/api/monitors/${monitor.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paused }),
            });
            if (!response.ok) {
                throw new Error(await readError(response, 'Failed to update monitor'));
            }
            await refresh();
            toast.success(paused ? 'Monitor paused' : 'Monitor resumed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update monitor');
        }
    };

    const deleteMonitor = async (monitor: MonitorSummary) => {
        setDeleting(true);
        try {
            const response = await fetch(`/api/monitors/${monitor.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error(await readError(response, 'Failed to delete monitor'));
            }
            await refresh();
            setMonitorToDelete(null);
            toast.success('Monitor deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete monitor');
        } finally {
            setDeleting(false);
        }
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
                title="Monitor"
                description="Watch HTTP endpoints from your own agents — including services nothing outside your network can reach"
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
            ) : error ? (
                // Only reached before anything has loaded; a failed poll after
                // that toasts instead, leaving the last good list on screen.
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
                    <p className="text-sm text-destructive">{error}</p>
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
