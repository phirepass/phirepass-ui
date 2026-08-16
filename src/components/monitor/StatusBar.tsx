'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { MonitorStatus, MonitorStatusCounts } from '@/types/monitor';

import { STATUS_STYLES } from './monitor-display';

/**
 * How a group's monitors are split across states, as one horizontal bar.
 *
 * Part-to-whole, so a stacked bar rather than a pie — a reader compares lengths
 * along a shared baseline instead of judging angles, and it degrades gracefully
 * when one state holds 95% of the total.
 *
 * The colours are the product's **status** palette, which is reserved and never
 * reused for arbitrary series: green means healthy everywhere, amber means worth
 * a look, red means broken. They are never the only carrier of meaning — the
 * legend beneath spells out every state present, in words and numbers, and each
 * segment names itself on hover.
 *
 * Worst-first ordering is deliberate. The eye starts at the left edge, so the
 * thing that needs attention is the thing it lands on.
 */

/** Worst first: the left edge is where the eye starts. */
const ORDER: MonitorStatus[] = ['down', 'degraded', 'unknown', 'up', 'paused'];

/**
 * Segments narrower than this are widened to it.
 *
 * One monitor down out of four hundred is 0.25% — a sliver too thin to see, and
 * that is exactly the case the bar exists to surface. The distortion is bounded
 * and always in the direction of showing a problem rather than hiding one.
 */
const MIN_SEGMENT_PERCENT = 3;

interface StatusBarProps {
    counts: MonitorStatusCounts;
    total: number;
    className?: string;
}

export function StatusBar({ counts, total, className }: StatusBarProps) {
    if (total === 0) {
        return null;
    }

    const present = ORDER.filter((status) => counts[status] > 0);

    // Raw shares first, then floor the small ones and take the difference out of
    // the largest — so the bar still sums to 100% and the widening never pushes
    // a segment off the end.
    const raw = present.map((status) => ({
        status,
        count: counts[status],
        share: (counts[status] / total) * 100,
    }));

    const widened = raw.map((entry) => ({
        ...entry,
        share: Math.max(entry.share, MIN_SEGMENT_PERCENT),
    }));
    const overflow = widened.reduce((sum, e) => sum + e.share, 0) - 100;
    if (overflow > 0) {
        const largest = widened.reduce((a, b) => (a.share >= b.share ? a : b));
        largest.share = Math.max(MIN_SEGMENT_PERCENT, largest.share - overflow);
    }

    return (
        <div className={className}>
            {/* `gap` gives the 2px surface separation between touching fills;
                the track underneath keeps the bar's shape when segments are
                narrow. */}
            <div
                className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-secondary"
                role="img"
                aria-label={present
                    .map((status) => `${counts[status]} ${STATUS_STYLES[status].label.toLowerCase()}`)
                    .join(', ')}
            >
                {widened.map((entry) => (
                    <Tooltip key={entry.status}>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    'h-full rounded-full transition-opacity hover:opacity-75',
                                    STATUS_STYLES[entry.status].dot,
                                )}
                                style={{ width: `${entry.share}%` }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {entry.count} {STATUS_STYLES[entry.status].label.toLowerCase()}
                            {' · '}
                            {((entry.count / total) * 100).toFixed(entry.count === total ? 0 : 1)}%
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>

            {/* The legend, so identity is never colour alone. Text keeps its own
                tokens; the dot beside it carries the state. */}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {present.map((status) => (
                    <span key={status} className="flex items-center gap-1.5">
                        <span
                            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_STYLES[status].dot)}
                        />
                        <span className="tabular-nums text-foreground">{counts[status]}</span>
                        {STATUS_STYLES[status].label.toLowerCase()}
                    </span>
                ))}
            </div>
        </div>
    );
}
