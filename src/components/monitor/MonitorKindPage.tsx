'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Plus } from 'lucide-react';

import { AlertStrip } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { FilterChips, SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    MONITOR_KIND_HINTS,
    MONITOR_KIND_LABELS,
    type MonitorKind,
    type MonitorStatus,
} from '@/types/monitor';

import { MonitorCard } from './MonitorCard';
import { MonitorDialogs } from './MonitorDialogs';
import { KIND_ICONS, KIND_STYLES } from './monitor-display';
import { useMonitorActions } from './use-monitor-actions';
import { useMonitorList, useMonitorOverview } from './use-monitor-data';

/**
 * Twenty-four rather than the six the combined page used.
 *
 * That six was sized for a page carrying three kinds' worth of section headers,
 * a stat row and an alert strip. This page is one kind and nothing else, so a
 * full three-column grid of eight rows reads fine — and the server only
 * aggregates history for the monitors on the page, so the cost is the page size
 * rather than the fleet size.
 */
const PAGE_SIZE = 24;

/** Long enough that typing does not fire a query per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

type StatusFilter = 'all' | MonitorStatus;

interface MonitorKindPageProps {
    kind: MonitorKind;
}

/**
 * Every monitor of one kind, paged server-side.
 *
 * Two reads, both narrow: `/api/monitors?kind=…&page=…` for the page itself, and
 * the shared summary for the filter chip counts and the alert strip. The list
 * request never returns a monitor this page is not about to draw.
 */
export default function MonitorKindPage({ kind }: MonitorKindPageProps) {
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);

    // Debounced so a filter change is one request rather than one per keystroke.
    // The input stays controlled by `searchInput`, so typing is never laggy.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    // Scoped to this kind, so the response carries this group's counts and its
    // problems — and the server computes neither for any other group.
    const { summaryFor, alerts, refresh: refreshSummary } = useMonitorOverview(kind);
    const summary = summaryFor(kind);

    const {
        page: listPage,
        loading,
        error,
        refresh: refreshList,
    } = useMonitorList({
        kind,
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
    });

    // A mutation changes both the page and the counts above it, so both reload.
    const refresh = useCallback(async () => {
        await Promise.all([refreshList(), refreshSummary()]);
    }, [refreshList, refreshSummary]);

    const actions = useMonitorActions(refresh);

    const monitors = useMemo(() => listPage?.monitors ?? [], [listPage]);
    const total = listPage?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // A delete can empty the last page. Corrected during render rather than from
    // an effect — React's documented way to adjust state when what it derived
    // from changes, and it re-renders before committing instead of cascading a
    // second paint. Costs one wasted request in the rare case it fires.
    if (page > pageCount) {
        setPage(pageCount);
    }

    const Icon = KIND_ICONS[kind];
    const counts = summary.counts;
    const filtered = filter !== 'all' || search.length > 0;

    const addButton = (
        <Button size="sm" className="gap-2 w-fit" onClick={actions.openCreate}>
            <Plus className="h-4 w-4" />
            Add Monitor
        </Button>
    );

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <PageHeader
                title={MONITOR_KIND_LABELS[kind]}
                description={MONITOR_KIND_HINTS[kind]}
                badge={
                    <span className={cn('rounded-lg border p-1.5', KIND_STYLES[kind].chip)}>
                        <Icon className="h-4 w-4" />
                    </span>
                }
                actions={
                    <>
                        <Button asChild size="sm" variant="outline" className="gap-2 w-fit">
                            <Link href="/dashboard/monitors">
                                <ArrowLeft className="h-4 w-4" />
                                All monitors
                            </Link>
                        </Button>
                        {addButton}
                    </>
                }
            />

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Loading monitors...</p>
                </div>
            ) : error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    <SearchBar
                        value={searchInput}
                        onChange={setSearchInput}
                        placeholder={`Search ${MONITOR_KIND_LABELS[kind].toLowerCase()} monitors...`}
                        aria-label="Search monitors by name, target, or agent"
                    >
                        <FilterChips<StatusFilter>
                            label="Filter monitors by status"
                            value={filter}
                            onChange={(value) => {
                                setFilter(value);
                                setPage(1);
                            }}
                            options={[
                                { value: 'all', label: 'All', count: summary.total },
                                { value: 'down', label: 'Down', count: counts.down },
                                { value: 'degraded', label: 'Degraded', count: counts.degraded },
                                { value: 'up', label: 'Up', count: counts.up },
                                { value: 'paused', label: 'Paused', count: counts.paused },
                            ]}
                        />
                    </SearchBar>

                    {monitors.length === 0 ? (
                        <EmptyState
                            icon={Activity}
                            title={
                                filtered
                                    ? 'No monitors match this view'
                                    : `No ${MONITOR_KIND_LABELS[kind].toLowerCase()} monitors yet`
                            }
                            description={
                                filtered
                                    ? 'Try a different search term or clear the status filter.'
                                    : 'Add one and the scheduler starts checking it right away.'
                            }
                            action={filtered ? null : addButton}
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {monitors.map((monitor) => (
                                    <MonitorCard
                                        key={monitor.id}
                                        monitor={monitor}
                                        checking={actions.checkingId === monitor.id}
                                        onOpen={actions.openDetail}
                                        onCheckNow={(target) => void actions.checkNow(target)}
                                        onTogglePause={(target) => void actions.togglePause(target)}
                                        onEdit={actions.openEdit}
                                        onDelete={actions.requestDelete}
                                    />
                                ))}
                            </div>

                            <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
                        </>
                    )}
                </>
            )}

            {/* Resolved from the current page — the only monitors that have a
                card here to open the dialog from. */}
            <MonitorDialogs actions={actions} monitors={monitors} />
        </div>
    );
}
