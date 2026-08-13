import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DailyBucket } from '@/types/monitor';

/**
 * The 30-day bar every status page has. One bar per day, coloured by that day's
 * worst outcome.
 *
 * Four tones, not three. A day whose only checks were `unknown` — the agent
 * timed out, disconnected, or shed the probe — is drawn as a warning rather
 * than as empty. Without that it renders identically to a day the monitor did
 * not exist, which is the one reading that is definitely wrong: something was
 * scheduled, something went wrong, and the graph said nothing.
 *
 * `unknown` still never moves `uptime_pct` — the target was never judged, so it
 * cannot count for or against the score. It is visible without being blamed.
 * `degraded` is treated the same way for scoring (a slow success is a success)
 * but is drawn as a warning, so a service sliding toward failure shows on the
 * strip before it starts failing.
 */
export function UptimeStrip({ daily, className }: { daily: DailyBucket[]; className?: string }) {
    return (
        <div className={cn('flex items-end gap-[2px]', className)}>
            {daily.map((day) => {
                const hasUnknown = day.unknown_checks > 0;
                const hasDegraded = day.degraded_checks > 0;
                const hasDown = day.down_checks > 0;
                // `checks` includes unknowns, so a verdict needs the difference.
                const hasVerdict = day.checks - day.unknown_checks > 0;
                const uptime = day.uptime_pct;

                // Worst outcome wins, and `degraded` counts as an outcome. A
                // slow success does not move `uptime_pct` — it is still a
                // success — so without an explicit branch a day spent entirely
                // degraded computes to 100% and draws solid green, hiding the
                // exact trend the state exists to make visible.
                const tone = !hasVerdict && !hasUnknown
                    ? 'bg-muted/60'
                    : !hasVerdict
                        // Attempted all day, learned nothing.
                        ? 'bg-warning/50'
                        : hasDown
                            ? uptime !== null && uptime >= 99
                                ? 'bg-warning/80'
                                : 'bg-destructive/80'
                            : hasDegraded
                                ? 'bg-warning/80'
                                : hasUnknown
                                    ? 'bg-success/60'
                                    : 'bg-success/80';

                return (
                    <Tooltip key={day.day}>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    'h-6 min-w-[3px] flex-1 rounded-[2px] transition-opacity hover:opacity-70',
                                    tone
                                )}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <span className="font-mono text-xs">{day.day}</span>
                            <br />
                            {hasVerdict ? (
                                <>
                                    {uptime?.toFixed(2)}% up · {day.checks} check{day.checks === 1 ? '' : 's'}
                                    {day.down_checks > 0 ? ` · ${day.down_checks} failed` : ''}
                                    {day.degraded_checks > 0 ? ` · ${day.degraded_checks} slow` : ''}
                                    {day.avg_latency_ms !== null ? ` · ${day.avg_latency_ms}ms avg` : ''}
                                </>
                            ) : hasUnknown ? null : (
                                'No checks recorded'
                            )}
                            {hasUnknown ? (
                                <>
                                    {hasVerdict ? <br /> : null}
                                    <span className="text-warning">
                                        {day.unknown_checks} check{day.unknown_checks === 1 ? '' : 's'} did not
                                        complete — the agent did not answer
                                    </span>
                                </>
                            ) : null}
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}
