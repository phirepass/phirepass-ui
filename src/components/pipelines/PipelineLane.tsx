'use client';

import Link from 'next/link';
import {
    Clock,
    GitBranch,
    Hand,
    MoreHorizontal,
    Pause,
    Pencil,
    Play,
    Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    flattenSteps,
    latestRun,
    type Pipeline,
    type PipelineAgent,
    type PipelineRun,
} from '@/types/pipeline';

import { StepProgressBar } from './StepProgressBar';
import {
    HEALTH_BADGES,
    PIPELINE_STATUS_STYLES,
    RUN_STATUS_STYLES,
    describeHealth,
    describeTrigger,
    formatDuration,
    formatRelativeTime,
    formatUntil,
    needsAttention,
    nextFiring,
    offlineSteps,
    recentRuns,
    resolveHealth,
    runDuration,
    successRate,
} from './pipeline-display';

/** Runs drawn in the history chart. Enough to see a pattern, few enough to read. */
const HISTORY_RUNS = 8;

/** The chart's tallest and shortest bar, in pixels. */
const HISTORY_MAX_H = 18;
const HISTORY_MIN_H = 4;

interface PipelineLaneProps {
    pipeline: Pipeline;
    agents: PipelineAgent[];
    /** Ticking clock from the page, so every countdown moves together. */
    now: number;
    canManage: boolean;
    onOpen: (pipeline: Pipeline) => void;
    onRunNow: (pipeline: Pipeline) => void;
    onTogglePause: (pipeline: Pipeline) => void;
    onDelete: (pipeline: Pipeline) => void;
}

/**
 * One pipeline as a row in a grouped list.
 *
 * A row rather than a card, because the interesting comparison between two
 * pipelines is *when they run* and *whether they are healthy*, and rows put
 * those in the same columns for every pipeline on the page. Rows also carry no
 * border of their own — the list draws one divider between them, which is what
 * keeps twenty pipelines from reading as twenty separate objects.
 *
 * Four things across, in the order they are asked about: what state is this in
 * (the badge), what is it and when does it run, how did the last run go, and
 * when does it go again. Everything else — how many steps, how many branches,
 * whether an agent is offline — is a modifier of the second and lives on its
 * second line, so the middle column can be a bar and a single sentence rather
 * than a cluster of counters.
 */
export function PipelineLane({
    pipeline,
    agents,
    now,
    canManage,
    onOpen,
    onRunNow,
    onTogglePause,
    onDelete,
}: PipelineLaneProps) {
    const run = latestRun(pipeline);
    const runStyle = run ? RUN_STATUS_STYLES[run.status] : null;
    const next = nextFiring(pipeline, new Date(now));
    const rate = successRate(pipeline);
    const history = recentRuns(pipeline, HISTORY_RUNS);
    const flat = flattenSteps(pipeline.steps);
    const branches = flat.filter((entry) => entry.step.kind === 'branch').length;

    const offline = offlineSteps(pipeline, agents);
    const health = resolveHealth(pipeline, agents);
    const badge = HEALTH_BADGES[health];
    const BadgeIcon = badge.icon;
    const urgent = needsAttention(health);

    return (
        // The whole row opens the pipeline. The name stays a real button so the
        // row is reachable by keyboard; the click handler here only saves the
        // pointer from having to find it.
        <div
            onClick={() => onOpen(pipeline)}
            className={cn(
                'group relative grid cursor-pointer grid-cols-1 items-center gap-x-6 gap-y-3 py-4 pl-5 pr-4',
                'transition-colors duration-150 ease-mac hover:bg-white/[0.035]',
                'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto]',
                pipeline.status !== 'active' && 'opacity-65'
            )}
        >
            {/* A row that needs a person carries a lit edge, so the group it is
                filed under is legible from the shape of the list alone. */}
            {urgent ? (
                <span
                    aria-hidden
                    className={cn(
                        'absolute inset-y-0 left-0 w-[2px]',
                        health === 'failing' ? 'bg-destructive/70' : 'bg-warning/70'
                    )}
                />
            ) : null}

            {/* State, name, schedule */}
            <div className="flex min-w-0 items-center gap-3.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ring-1 ring-inset',
                                badge.well
                            )}
                        >
                            <BadgeIcon className={cn('h-4 w-4', badge.tone, badge.spin && 'animate-spin')} />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{describeHealth(health, offline.length)}</TooltipContent>
                </Tooltip>

                <div className="min-w-0">
                    <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onOpen(pipeline); }}
                        className="block max-w-full truncate rounded text-left text-[14.5px] font-medium tracking-[-0.015em] text-foreground transition-colors group-hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                    >
                        {pipeline.name}
                    </button>

                    <div className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground/75">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex min-w-0 items-center gap-1.5">
                                    {pipeline.trigger.kind === 'cron'
                                        ? <Clock className="h-3 w-3 shrink-0 opacity-60" />
                                        : <Hand className="h-3 w-3 shrink-0 opacity-60" />}
                                    <span className="truncate">{describeTrigger(pipeline)}</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {pipeline.trigger.kind === 'cron' ? (
                                    <>
                                        <span className="font-mono">{pipeline.trigger.expression}</span>
                                        <br />
                                        {pipeline.trigger.timezone}
                                    </>
                                ) : 'Started by hand, never on a schedule'}
                            </TooltipContent>
                        </Tooltip>

                        <span aria-hidden className="text-muted-foreground/30">·</span>
                        <span className="shrink-0 whitespace-nowrap">{stepCounter(pipeline, run)}</span>

                        {branches > 0 ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="flex shrink-0 items-center gap-1">
                                        <GitBranch className="h-3 w-3" />
                                        {branches}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {branches} condition{branches === 1 ? '' : 's'} — only one path runs
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* How the last run went: the shape of it, then one sentence */}
            <div className="min-w-0 space-y-2">
                {/* Held a shade back. At full saturation a screen of these bars
                    is the loudest thing on the page, and they are the one part
                    of a row whose colour is already spelled out in words
                    directly underneath. */}
                <StepProgressBar
                    steps={pipeline.steps}
                    run={run}
                    height="h-1.5"
                    className="opacity-80 transition-opacity group-hover:opacity-100"
                />
                <p className={cn('truncate text-[11.5px]', runStyle?.text ?? 'text-muted-foreground/70')}>
                    {caption(pipeline, now)}
                </p>
            </div>

            {/* History, countdown, actions */}
            <div className="flex items-center justify-end gap-5">
                <RunHistory runs={history} rate={rate} now={now} />

                <div className="w-[4.75rem] shrink-0 text-right">
                    {next ? (
                        <>
                            <p className="text-[14px] tabular-nums leading-tight tracking-[-0.01em] text-foreground">
                                {formatUntil(next.getTime(), now).replace('in ', '')}
                            </p>
                            <p className="mt-1 text-[10.5px] uppercase leading-tight tracking-[0.06em] text-muted-foreground/50">
                                until next
                            </p>
                        </>
                    ) : (
                        <p className="text-[10.5px] uppercase leading-tight tracking-[0.06em] text-muted-foreground/50">
                            {pipeline.status === 'active'
                                ? 'On demand'
                                : PIPELINE_STATUS_STYLES[pipeline.status].label}
                        </p>
                    )}
                </div>

                <div onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                                aria-label={`Actions for ${pipeline.name}`}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="w-52 rounded-xl border-hairline bg-popover/95 p-1.5 shadow-xl backdrop-blur"
                        >
                            <DropdownMenuItem onClick={() => onOpen(pipeline)}>
                                Steps and runs
                            </DropdownMenuItem>
                            {canManage ? (
                                <>
                                    <DropdownMenuItem onClick={() => onRunNow(pipeline)}>
                                        <Play className="mr-2 h-4 w-4" />
                                        Run now
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link href={`/dashboard/pipelines/${pipeline.id}/edit`}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Open in editor
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => onTogglePause(pipeline)}
                                        disabled={pipeline.trigger.kind !== 'cron'}
                                    >
                                        {pipeline.status === 'paused'
                                            ? <Play className="mr-2 h-4 w-4" />
                                            : <Pause className="mr-2 h-4 w-4" />}
                                        {pipeline.status === 'paused' ? 'Resume schedule' : 'Pause schedule'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => onDelete(pipeline)}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
}

/**
 * The last few runs, as a small chart standing on a baseline.
 *
 * Height is duration and colour is outcome, which is one more fact than a row
 * of equal ticks carried and the one people actually watch for: a job that has
 * been creeping from thirty seconds to four minutes is a problem well before it
 * is a failure, and it shows here as a staircase.
 *
 * The scale is a square root, not linear. Durations on a page like this differ
 * by two orders of magnitude, and on a linear scale one four-minute run flattens
 * every seven-second run beside it into the baseline; the root keeps the short
 * ones visible while the tall one is still obviously the tall one.
 *
 * The slot is a fixed width filled from the right, so a pipeline with two runs
 * charts them in the same column as one with eight, and nothing is padded with
 * blanks standing for runs that never happened.
 */
function RunHistory({ runs, rate, now }: { runs: PipelineRun[]; rate: number | null; now: number }) {
    const durations = runs.map((run) => Math.max(runDuration(run, now), 0));
    const longest = Math.max(...durations, 1);

    return (
        <div className="hidden w-[3.5rem] justify-end sm:flex">
            {runs.length === 0 ? null : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            className="flex items-end gap-[3px] border-b border-hairline-strong pb-[3px] opacity-80 transition-opacity group-hover:opacity-100"
                            style={{ height: HISTORY_MAX_H + 4 }}
                            aria-label="Recent runs"
                        >
                            {runs.map((run, index) => (
                                <span
                                    key={run.id}
                                    className={cn('w-[3px] rounded-full', RUN_STATUS_STYLES[run.status].bar)}
                                    style={{
                                        height: HISTORY_MIN_H
                                            + Math.round(Math.sqrt(durations[index] / longest) * (HISTORY_MAX_H - HISTORY_MIN_H)),
                                    }}
                                />
                            ))}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        Last {runs.length} run{runs.length === 1 ? '' : 's'}
                        {rate === null ? '' : ` · ${rate}% succeeded`}
                        <br />
                        <span className="text-muted-foreground">
                            Tallest is {formatDuration(longest)} — bar height is how long it took
                        </span>
                    </TooltipContent>
                </Tooltip>
            )}
        </div>
    );
}

/**
 * The size of the pipeline, or the position within a run in flight.
 *
 * "3/3 steps" under a run that failed at the second one is a lie the bar then
 * has to argue with — a failed step is settled, so a naive completed-count
 * reaches the total whatever happened. Only a run still in flight gets a
 * position; everything else states the size of the pipeline and leaves the
 * outcome to the caption under the bar.
 */
function stepCounter(pipeline: Pipeline, run: PipelineRun | null): string {
    const total = flattenSteps(pipeline.steps).length;

    if (run && (run.status === 'running' || run.status === 'queued')) {
        const index = run.steps.findIndex((step) => step.status === 'running');
        if (index !== -1) return `step ${index + 1} of ${run.steps.length}`;
    }

    return `${total} step${total === 1 ? '' : 's'}`;
}

/**
 * The one line under the bar.
 *
 * Says the most specific true thing available: which step is running, which one
 * failed, or when the last run finished. A generic "Succeeded" under a bar that
 * is already entirely green would be spending the line on nothing.
 */
function caption(pipeline: Pipeline, now: number): string {
    const run = latestRun(pipeline);
    if (!run) return pipeline.status === 'draft' ? 'Draft — never run' : 'Never run';

    if (run.status === 'running') {
        const running = run.steps.find((step) => step.status === 'running');
        return running ? `Running “${running.name}”` : 'Running';
    }

    if (run.status === 'queued') return 'Queued';

    if (run.status === 'failed') {
        const failed = run.steps.find((step) => step.status === 'failed');
        if (failed) {
            return `Failed at “${failed.name}”${failed.exit_code === null ? '' : ` · exit ${failed.exit_code}`}`;
        }
        return 'Failed';
    }

    if (run.status === 'cancelled') return `Cancelled ${formatRelativeTime(run.started_at, now)}`;

    return `Succeeded ${formatRelativeTime(run.started_at, now)} in ${formatDuration(runDuration(run, now))}`;
}
