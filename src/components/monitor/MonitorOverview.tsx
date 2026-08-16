'use client';

import { Activity, AlertTriangle, CheckCircle2, Plus, XCircle } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatTiles } from '@/components/StatTiles';
import { Button } from '@/components/ui/button';

import { KIND_ORDER } from './kind-order';
import { MonitorDialogs } from './MonitorDialogs';
import { MonitorKindPanel } from './MonitorKindPanel';
import { useMonitorActions } from './use-monitor-actions';
import { useMonitorOverview } from './use-monitor-data';

/**
 * The monitor landing page: one panel per probe kind, and nothing that needs
 * scrolling past.
 *
 * It fetches `/api/monitors/summary` and nothing else — no monitor rows, no
 * check history. The list lives on `/dashboard/monitors/{kind}`, paged
 * server-side. Splitting them is what makes both cheap and readable: the old
 * single page pulled every monitor with thirty days of history to draw three
 * summary panels, then cut its groups out of a six-per-page slice, so a fleet of
 * twenty HTTP checks produced four consecutive pages all headed "HTTP(S)".
 */
export default function MonitorOverview() {
    const { overview, summaryFor, loading, error, refresh } = useMonitorOverview();
    const actions = useMonitorActions(refresh);

    const counts = overview?.counts;
    const total = overview?.total ?? 0;

    const addButton = (
        <Button size="sm" className="gap-2 w-fit" onClick={actions.openCreate}>
            <Plus className="h-4 w-4" />
            Add Monitor
        </Button>
    );

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <PageHeader
                title="Monitors"
                description="Watch HTTP endpoints from your own agents — including services nothing outside your network can reach"
                actions={addButton}
            />

            <StatTiles
                tiles={[
                    { label: 'Total monitors', value: total, icon: Activity, tone: 'primary' },
                    { label: 'Up', value: counts?.up ?? 0, icon: CheckCircle2, tone: 'success' },
                    { label: 'Down', value: counts?.down ?? 0, icon: XCircle, tone: 'danger' },
                    { label: 'Degraded', value: counts?.degraded ?? 0, icon: AlertTriangle, tone: 'warning' },
                ]}
            />

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Loading monitors...</p>
                </div>
            ) : error ? (
                // Only reached before anything has loaded; a failed poll after
                // that toasts instead, leaving the last good view on screen.
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            ) : total === 0 ? (
                <EmptyState
                    icon={Activity}
                    title="No monitors yet"
                    description="Add a URL, a TLS endpoint, or a domain and the scheduler starts checking it right away."
                    action={addButton}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                    {KIND_ORDER.map((kind) => (
                        <MonitorKindPanel
                            key={kind}
                            summary={summaryFor(kind)}
                            onAdd={actions.openCreate}
                        />
                    ))}
                </div>
            )}

            {/* No list on this page, so nothing can open the detail dialog here;
                the create form is the only one that ever shows. */}
            <MonitorDialogs actions={actions} monitors={[]} />
        </div>
    );
}
