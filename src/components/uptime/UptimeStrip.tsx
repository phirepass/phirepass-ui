import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DailyBucket } from '@/types/uptime';

/**
 * The 30-day bar every status page has. One bar per day, coloured by that day's
 * worst outcome; days with no data stay a flat neutral rather than green, so an
 * unmonitored gap is never mistaken for a clean run.
 */
export function UptimeStrip({ daily, className }: { daily: DailyBucket[]; className?: string }) {
    return (
        <div className={cn('flex items-end gap-[2px]', className)}>
            {daily.map((day) => {
                const hasData = day.checks > 0;
                const uptime = day.uptime_pct;

                const tone = !hasData
                    ? 'bg-muted/60'
                    : uptime === 100
                        ? 'bg-success/80'
                        : uptime !== null && uptime >= 99
                            ? 'bg-warning/80'
                            : 'bg-destructive/80';

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
                            {hasData ? (
                                <>
                                    {uptime?.toFixed(2)}% up · {day.checks} check{day.checks === 1 ? '' : 's'}
                                    {day.down_checks > 0 ? ` · ${day.down_checks} failed` : ''}
                                    {day.avg_latency_ms !== null ? ` · ${day.avg_latency_ms}ms avg` : ''}
                                </>
                            ) : (
                                'No checks recorded'
                            )}
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}
