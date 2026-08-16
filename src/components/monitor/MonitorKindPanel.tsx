'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    MONITOR_KIND_HINTS,
    MONITOR_KIND_LABELS,
    type MonitorKindSummary,
    type MonitorStatusCounts,
} from '@/types/monitor';

import {
    KIND_ICONS,
    KIND_STYLES,
    STATUS_STYLES,
    formatRelativeTime,
    formatUptime,
} from './monitor-display';

interface MonitorKindPanelProps {
    summary: MonitorKindSummary;
    onAdd: () => void;
}

/** The one status a panel leads with: the worst thing in the group. */
function headline(counts: MonitorStatusCounts): { label: string; tone: string; dot: string } {
    if (counts.down > 0) {
        return { label: `${counts.down} down`, tone: STATUS_STYLES.down.text, dot: STATUS_STYLES.down.dot };
    }
    if (counts.degraded > 0) {
        return {
            label: `${counts.degraded} degraded`,
            tone: STATUS_STYLES.degraded.text,
            dot: STATUS_STYLES.degraded.dot,
        };
    }
    if (counts.unknown > 0) {
        return {
            label: `${counts.unknown} unknown`,
            tone: STATUS_STYLES.unknown.text,
            dot: STATUS_STYLES.unknown.dot,
        };
    }
    if (counts.up > 0) {
        return { label: 'All up', tone: STATUS_STYLES.up.text, dot: STATUS_STYLES.up.dot };
    }
    return { label: 'All paused', tone: STATUS_STYLES.paused.text, dot: STATUS_STYLES.paused.dot };
}

/**
 * One panel per probe kind: what it watches, how much of it there is, and the
 * single worst thing about it right now.
 *
 * Every number here arrives pre-aggregated from `/api/monitors/summary` — the
 * panel holds no monitors at all. That is the point of the split: the overview
 * answers "is anything wrong, and where" from a response whose size does not
 * grow with the fleet, and the per-kind page answers "which one" with a paged
 * list. Anything that would need a scrollbar here belongs on that page.
 */
export function MonitorKindPanel({ summary, onAdd }: MonitorKindPanelProps) {
    const { kind, total, counts, worst, next_expiry: nextExpiry, uptime_24h_pct: uptime } = summary;

    const Icon = KIND_ICONS[kind];
    const styles = KIND_STYLES[kind];
    const lead = headline(counts);

    return (
        <section className="flex flex-col rounded-xl border border-border gradient-card p-5">
            <div className="flex items-start gap-3">
                <span className={cn('mt-0.5 shrink-0 rounded-lg border p-2', styles.chip)}>
                    <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                        {MONITOR_KIND_LABELS[kind]}
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {MONITOR_KIND_HINTS[kind]}
                    </p>
                </div>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums text-foreground">{total}</span>
                <span className="text-xs text-muted-foreground">
                    {total === 1 ? 'monitor' : 'monitors'}
                </span>
                {total > 0 ? (
                    <span className={cn('ml-auto flex items-center gap-1.5 text-xs font-medium', lead.tone)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', lead.dot)} />
                        {lead.label}
                    </span>
                ) : null}
            </div>

            {total === 0 ? (
                <p className="mt-3 flex-1 text-xs text-muted-foreground">
                    Nothing here yet. Add one and the scheduler starts checking it right away.
                </p>
            ) : (
                <div className="mt-3 flex-1 space-y-2 text-xs">
                    {/* Only states that are present. A zero is omitted rather
                        than shown as "0 down", which reads as an alert at a
                        glance in a row of numbers. */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                        {(['down', 'degraded', 'unknown', 'up', 'paused'] as const)
                            .filter((status) => counts[status] > 0)
                            .map((status) => (
                                <span key={status} className="flex items-center gap-1.5">
                                    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_STYLES[status].dot)} />
                                    <span className="tabular-nums">{counts[status]}</span>
                                    {STATUS_STYLES[status].label.toLowerCase()}
                                </span>
                            ))}
                    </div>

                    {/* Naming the worst one turns "2 down" into something
                        actionable without opening the page. The server sends it
                        only when it is genuinely worth pointing at — a healthy
                        head of the group comes back null. */}
                    {worst ? (
                        <p className="truncate">
                            <span className={STATUS_STYLES[worst.status].text}>
                                {STATUS_STYLES[worst.status].label}:
                            </span>{' '}
                            <span className="text-foreground">{worst.name}</span>
                            <span className="text-muted-foreground">
                                {' '}— checked {formatRelativeTime(worst.last_checked_at)}
                            </span>
                        </p>
                    ) : null}

                    {uptime !== null ? (
                        <p className="text-muted-foreground">
                            <span className="tabular-nums text-foreground">{formatUptime(uptime)}</span>
                            {' '}uptime over 24h
                        </p>
                    ) : null}

                    {nextExpiry ? (
                        <p className="truncate text-muted-foreground">
                            Next expiry:{' '}
                            <span className="text-foreground">{nextExpiry.name}</span>{' '}
                            <span
                                className={cn(
                                    'tabular-nums',
                                    nextExpiry.days <= 7 ? 'text-destructive' : 'text-foreground',
                                )}
                            >
                                {nextExpiry.days < 0 ? 'has expired' : `in ${nextExpiry.days}d`}
                            </span>
                        </p>
                    ) : null}
                </div>
            )}

            <div className="mt-4 pt-3 border-t border-border/60">
                {total === 0 ? (
                    <Button size="sm" variant="outline" className="w-full" onClick={onAdd}>
                        Add {MONITOR_KIND_LABELS[kind].toLowerCase()} monitor
                    </Button>
                ) : (
                    <Button asChild size="sm" variant="outline" className="w-full">
                        <Link href={`/dashboard/monitors/${kind}`}>
                            View all {total}
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                    </Button>
                )}
            </div>
        </section>
    );
}
