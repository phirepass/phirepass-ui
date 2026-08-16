'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    MONITOR_KIND_HINTS,
    MONITOR_KIND_LABELS,
    type MonitorKindSummary,
    type MonitorStatusCounts,
} from '@/types/monitor';

import { StatusBar } from './StatusBar';
import { UptimeStrip } from './UptimeStrip';
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

/** The one state a panel leads with: the worst thing in the group. */
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
 * One panel per probe kind: what it watches, how much of it there is, how that
 * splits across states, and how the last fortnight went.
 *
 * Three reads, deliberately in three different forms, because they answer three
 * different questions:
 *
 * - **the count** is a single number, so it is a figure and not a chart;
 * - **the split across states** is part-to-whole, so it is a stacked bar;
 * - **the fortnight** is change-over-time, so it is the same day-per-bar strip
 *   the detail dialog uses — one visual language for "history" across the app
 *   rather than a second one invented here.
 *
 * Everything arrives pre-aggregated from `/api/monitors/summary`; the panel
 * holds no monitors at all. That is the point of the split — the overview
 * answers "is anything wrong, and where" from a response whose size does not
 * grow with the fleet, and the per-kind page answers "which one".
 */
export function MonitorKindPanel({ summary, onAdd }: MonitorKindPanelProps) {
    const {
        kind,
        total,
        counts,
        worst,
        next_expiry: nextExpiry,
        uptime_24h_pct: uptime,
        daily,
    } = summary;

    const Icon = KIND_ICONS[kind];
    const styles = KIND_STYLES[kind];
    const lead = headline(counts);
    const hasHistory = daily.some((day) => day.checks > 0);

    return (
        <section className="relative flex flex-col overflow-hidden rounded-xl border border-border gradient-card">
            {/* ── watermark ────────────────────────────────────────────
                The kind's own icon, oversized, as the panel's ground. It is
                what makes three otherwise-identical cards tell themselves
                apart at a glance and from across a room.

                Decorative only: `aria-hidden` because the heading already
                names the kind, `pointer-events-none` so it never eats a hover
                meant for the strip beneath it, and low enough in opacity that
                it changes no text's contrast — it tints the card rather than
                competing with anything on it. Bled off the top-right corner so
                its silhouette reads as a shape rather than a stamped logo. */}
            <Icon
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -bottom-12 -right-12 h-72 w-72 opacity-[0.09]',
                    styles.text,
                )}
                strokeWidth={0.75}
            />

            {/* Everything else rides above it. */}
            <div className="relative flex items-start gap-3 p-5 pb-4">
                <span className={cn('shrink-0 rounded-xl border p-3', styles.chip)}>
                    <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                        {MONITOR_KIND_LABELS[kind]}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {MONITOR_KIND_HINTS[kind]}
                    </p>
                </div>
            </div>

            {total === 0 ? (
                <div className="relative flex flex-1 flex-col justify-end px-5 pb-5">
                    <p className="mb-4 text-xs text-muted-foreground">
                        Nothing here yet. Add one and the scheduler starts checking it right away.
                    </p>
                    <Button size="sm" variant="outline" className="w-full" onClick={onAdd}>
                        Add {MONITOR_KIND_LABELS[kind].toLowerCase()} monitor
                    </Button>
                </div>
            ) : (
                <>
                    {/* ── the two figures ──────────────────────────────
                        The count is the group's identity, the uptime is its
                        health. Proportional figures, not tabular: these are
                        standalone values, not a column of digits to align. */}
                    <div className="relative flex items-end justify-between gap-4 px-5">
                        <div className="min-w-0">
                            <div className="text-[44px] font-semibold leading-none tracking-tight text-foreground">
                                {total}
                            </div>
                            <div className="mt-1.5 text-xs text-muted-foreground">
                                {total === 1 ? 'monitor' : 'monitors'}
                            </div>
                        </div>

                        <div className="min-w-0 text-right">
                            {uptime !== null ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="cursor-default">
                                            <div className="text-2xl font-semibold leading-none text-foreground">
                                                {formatUptime(uptime)}
                                            </div>
                                            <div className="mt-1.5 text-xs text-muted-foreground">
                                                uptime · 24h
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Across every check this group recorded in the last 24 hours.
                                        Checks that reached no verdict are excluded rather than
                                        counted as uptime.
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <div className="text-xs text-muted-foreground">no checks yet</div>
                            )}
                        </div>
                    </div>

                    {/* ── part-to-whole ────────────────────────────────── */}
                    <div className="relative mt-4 px-5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Status
                            </span>
                            <span className={cn('flex items-center gap-1.5 text-xs font-medium', lead.tone)}>
                                <span className={cn('h-1.5 w-1.5 rounded-full', lead.dot)} />
                                {lead.label}
                            </span>
                        </div>
                        <StatusBar counts={counts} total={total} />
                    </div>

                    {/* ── change over time ─────────────────────────────── */}
                    <div className="relative mt-5 px-5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Last 14 days
                            </span>
                            {!hasHistory ? (
                                <span className="text-[11px] text-muted-foreground">no history yet</span>
                            ) : null}
                        </div>
                        <UptimeStrip daily={daily} barHeight="h-11" />
                    </div>

                    {/* ── the one line worth acting on ─────────────────── */}
                    <div className="relative mt-4 flex-1 space-y-1.5 px-5 text-xs">
                        {worst ? (
                            <p className="truncate">
                                <span className={cn('font-medium', STATUS_STYLES[worst.status].text)}>
                                    {STATUS_STYLES[worst.status].label}:
                                </span>{' '}
                                <span className="text-foreground">{worst.name}</span>
                                <span className="text-muted-foreground">
                                    {' '}— checked {formatRelativeTime(worst.last_checked_at)}
                                </span>
                            </p>
                        ) : null}

                        {nextExpiry ? (
                            <p className="flex items-center gap-1.5 truncate text-muted-foreground">
                                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate text-foreground">{nextExpiry.name}</span>
                                <span
                                    className={cn(
                                        'shrink-0 tabular-nums',
                                        nextExpiry.days <= 7 ? 'text-destructive' : 'text-muted-foreground',
                                    )}
                                >
                                    {nextExpiry.days < 0 ? 'expired' : `expires in ${nextExpiry.days}d`}
                                </span>
                            </p>
                        ) : null}
                    </div>

                    <div className="relative mt-5 border-t border-border/60 p-3">
                        <Button asChild size="sm" variant="ghost" className="w-full justify-between">
                            <Link href={`/dashboard/monitors/${kind}`}>
                                View all {total}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                    </div>
                </>
            )}
        </section>
    );
}
