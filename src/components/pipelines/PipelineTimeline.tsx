'use client';

import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { nextCronRuns } from '@/lib/cron';
import { cn } from '@/lib/utils';
import { latestRun, type Pipeline } from '@/types/pipeline';

import { formatInZone, formatUntil } from './pipeline-display';

/** How far ahead the rail looks. A day is the period a schedule repeats over. */
const WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

/** Firings drawn per pipeline, so a `*_/5 * * * *` job cannot flood the rail. */
const MAX_MARKERS_PER_PIPELINE = 24;

interface Firing {
    key: string;
    pipeline: Pipeline;
    at: number;
    /** 0–1 across the window, for positioning. */
    offset: number;
}

/**
 * The next 24 hours of scheduled work, drawn as one rail.
 *
 * This is the question the page exists to answer and the one a list of
 * pipelines answers worst: *what is about to happen, and is anything about to
 * happen all at once*. Every firing of every active schedule is placed on a
 * single axis, so a cluster at 03:00 is visible as a cluster rather than as six
 * rows that each happen to say "in 7h".
 *
 * Markers are coloured by the pipeline's last outcome, which turns the rail
 * into a small forecast: red marks upcoming runs of something that is already
 * failing, and those are the ones worth reaching for before they fire again.
 */
export function PipelineTimeline({
    pipelines,
    now,
    onSelect,
}: {
    pipelines: Pipeline[];
    now: number;
    onSelect: (pipeline: Pipeline) => void;
}) {
    const windowStart = now;
    const windowEnd = now + WINDOW_HOURS * HOUR_MS;

    const firings = useMemo<Firing[]>(() => {
        const collected: Firing[] = [];

        for (const pipeline of pipelines) {
            if (pipeline.status !== 'active' || pipeline.trigger.kind !== 'cron') continue;

            const runs = nextCronRuns(
                pipeline.trigger.expression,
                pipeline.trigger.timezone,
                MAX_MARKERS_PER_PIPELINE,
                new Date(windowStart)
            );

            for (const date of runs) {
                const at = date.getTime();
                if (at > windowEnd) break;
                collected.push({
                    key: `${pipeline.id}-${at}`,
                    pipeline,
                    at,
                    offset: (at - windowStart) / (windowEnd - windowStart),
                });
            }
        }

        return collected.sort((a, b) => a.at - b.at);
    }, [pipelines, windowStart, windowEnd]);

    // Hour gridlines, labelled every three hours so the axis stays readable on
    // a phone. The first tick is the next whole hour, not "now".
    const ticks = useMemo(() => {
        const first = Math.ceil(windowStart / HOUR_MS) * HOUR_MS;
        const marks: { at: number; offset: number; label: string }[] = [];

        for (let at = first; at <= windowEnd; at += HOUR_MS) {
            marks.push({
                at,
                offset: (at - windowStart) / (windowEnd - windowStart),
                label: new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', hourCycle: 'h23' }).slice(0, 2),
            });
        }

        return marks;
    }, [windowStart, windowEnd]);

    return (
        <section
            className="gradient-card mac-squircle rounded-xl border border-hairline px-5 py-4"
            aria-label="Scheduled runs in the next 24 hours"
        >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-medium text-foreground">Next 24 hours</h2>
                <p className="text-[11px] text-muted-foreground">
                    {firings.length === 0
                        ? 'Nothing scheduled'
                        : `${firings.length} run${firings.length === 1 ? '' : 's'} across ${new Set(firings.map((firing) => firing.pipeline.id)).size} pipeline${new Set(firings.map((firing) => firing.pipeline.id)).size === 1 ? '' : 's'}`}
                </p>
            </div>

            <div className="relative h-16 select-none">
                {/* Hour grid */}
                <div className="absolute inset-x-0 top-0 h-9">
                    {ticks.map((tick, index) => (
                        <span
                            key={tick.at}
                            aria-hidden
                            className={cn(
                                'absolute top-0 h-full w-px',
                                index % 3 === 0 ? 'bg-hairline-strong' : 'bg-hairline'
                            )}
                            style={{ left: `${tick.offset * 100}%` }}
                        />
                    ))}
                </div>

                {/* Baseline */}
                <span aria-hidden className="absolute inset-x-0 top-9 h-px bg-hairline-strong" />

                {/* Now */}
                <span
                    aria-hidden
                    className="absolute top-0 h-9 w-px bg-accent"
                    style={{ left: '0%' }}
                />
                <span className="absolute top-[38px] -translate-x-1/2 text-[10px] font-medium text-accent" style={{ left: '0%' }}>
                    now
                </span>

                {/* Firings */}
                {firings.map((firing) => {
                    const status = latestRun(firing.pipeline)?.status;
                    const tone = status === 'failed'
                        ? 'bg-destructive'
                        : status === 'running'
                            ? 'bg-info'
                            : status === undefined
                                ? 'bg-muted-foreground/60'
                                : 'bg-success';

                    return (
                        <Tooltip key={firing.key}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => onSelect(firing.pipeline)}
                                    aria-label={`${firing.pipeline.name} at ${new Date(firing.at).toLocaleTimeString()}`}
                                    className="absolute top-1 -translate-x-1/2 rounded p-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                                    style={{ left: `${firing.offset * 100}%` }}
                                >
                                    <span className={cn('block h-7 w-[3px] rounded-full transition-transform hover:scale-y-110', tone)} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <span className="font-medium">{firing.pipeline.name}</span>
                                <br />
                                {firing.pipeline.trigger.kind === 'cron'
                                    ? formatInZone(firing.at, firing.pipeline.trigger.timezone)
                                    : null}
                                <br />
                                {formatUntil(firing.at, now)}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}

                {/* Hour labels */}
                <div className="absolute inset-x-0 top-[52px] h-4">
                    {ticks.filter((_, index) => index % 3 === 0).map((tick) => (
                        <span
                            key={tick.at}
                            className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground/60"
                            style={{ left: `${tick.offset * 100}%` }}
                        >
                            {tick.label}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
