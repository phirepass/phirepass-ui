'use client';

import Link from 'next/link';
import { Clock, Hand, MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';

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
import { latestRun, type Pipeline, type PipelineAgent, type PipelineRun } from '@/types/pipeline';

import { StepChain } from './StepChain';
import {
    HEALTH_BADGES,
    PIPELINE_STATUS_STYLES,
    RUN_STATUS_STYLES,
    describeHealth,
    describeTrigger,
    formatDuration,
    formatInZone,
    formatRelativeTime,
    formatUntil,
    needsAttention,
    nextFiring,
    offlineSteps,
    pipelineAgents,
    recentRuns,
    resolveHealth,
    runDuration,
    successRate,
} from './pipeline-display';

/** Runs drawn in the history chart. Enough to see a pattern, few enough to read. */
const HISTORY_RUNS = 8;
const HISTORY_MAX_H = 14;
const HISTORY_MIN_H = 3;

/**
 * Agents named before the row starts counting instead.
 *
 * A step can target a tag or the whole fleet, so a three-step pipeline can
 * still touch a dozen machines; past half a dozen chips the line stops being a
 * fact anyone reads and starts being a wall.
 */
const MAX_AGENT_CHIPS = 6;

interface PipelineCardProps {
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
 * One pipeline as a card built around what it actually does.
 *
 * The listing this replaced was a table in all but name: a column of names, a
 * column of schedules, a bar standing in for however many steps there were. It
 * answered "when does this run" well and "what is this" not at all — every row
 * was the same shape, so the only way to tell a Slack digest from a NAS backup
 * was to read the name and remember.
 *
 * So the card is built the other way round. The steps are the picture: their
 * kinds in the editor's own colours, the agent each one lands on, the run
 * painted over them so the failed node is a red node. The schedule sits in the
 * header as a caption and the countdown in the footer as a fact, both still
 * there, neither pretending to be the subject.
 *
 * Three bands, hairline-separated: who it is, what it does, how it is going.
 */
export function PipelineCard({
    pipeline,
    agents,
    now,
    canManage,
    onOpen,
    onRunNow,
    onTogglePause,
    onDelete,
}: PipelineCardProps) {
    const run = latestRun(pipeline);
    const runStyle = run ? RUN_STATUS_STYLES[run.status] : null;
    const next = nextFiring(pipeline, new Date(now));
    const health = resolveHealth(pipeline, agents);
    const badge = HEALTH_BADGES[health];
    const BadgeIcon = badge.icon;
    const offline = offlineSteps(pipeline, agents);
    const urgent = needsAttention(health);
    const history = recentRuns(pipeline, HISTORY_RUNS);
    const fleet = pipelineAgents(pipeline, agents);

    return (
        // The card opens the pipeline. The name stays a real button so a
        // keyboard reaches it; this handler only saves the pointer from
        // having to find it.
        <div
            onClick={() => onOpen(pipeline)}
            className={cn(
                'group mac-squircle gradient-card relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border',
                // Hover brightens the edge and nothing moves. A card that lifts
                // under the pointer shifts the thing you were reading at the
                // moment you arrive at it, and with two columns of them the
                // page twitches all the way down.
                'transition-colors duration-200 ease-mac',
                urgent
                    ? 'border-destructive/25 hover:border-destructive/45'
                    : 'border-hairline hover:border-hairline-strong',
                pipeline.status !== 'active' && 'opacity-70 hover:opacity-100'
            )}
        >
            {/* Who it is */}
            <div className="flex items-start gap-3 px-4 pt-4">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] ring-1 ring-inset',
                                badge.well
                            )}
                        >
                            <BadgeIcon className={cn('h-4 w-4', badge.tone, badge.spin && 'animate-spin')} />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{describeHealth(health, offline.length)}</TooltipContent>
                </Tooltip>

                <div className="min-w-0 flex-1">
                    <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onOpen(pipeline); }}
                        className="block max-w-full truncate rounded text-left text-[14.5px] font-medium tracking-[-0.015em] text-foreground transition-colors group-hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                    >
                        {pipeline.name}
                    </button>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground/75">
                                {pipeline.trigger.kind === 'cron'
                                    ? <Clock className="h-3 w-3 shrink-0 opacity-60" />
                                    : <Hand className="h-3 w-3 shrink-0 opacity-60" />}
                                <span className="truncate">{describeTrigger(pipeline)}</span>
                            </p>
                        </TooltipTrigger>
                        <TooltipContent>
                            {pipeline.trigger.kind === 'cron' ? (
                                <>
                                    <span className="font-mono">{pipeline.trigger.expression}</span>
                                    <br />
                                    {pipeline.trigger.timezone}
                                    {next ? <><br />Next {formatInZone(next.getTime(), pipeline.trigger.timezone)}</> : null}
                                </>
                            ) : 'Started by hand, never on a schedule'}
                        </TooltipContent>
                    </Tooltip>
                </div>

                <div onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
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

            {/* What it does */}
            <div className="flex-1 overflow-x-auto px-4 pb-3 pt-4">
                <StepChain steps={pipeline.steps} run={run} agents={agents} />
            </div>

            {/* Where it lands */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-hairline px-4 py-2">
                <span className="mr-1 text-[10px] uppercase tracking-[0.07em] text-muted-foreground/45">
                    Runs on
                </span>
                {fleet.length === 0 ? (
                    <span className="text-[11px] text-warning">nothing — no agent matches its targets</span>
                ) : (
                    fleet.slice(0, MAX_AGENT_CHIPS).map((agent) => (
                        agent.online ? (
                            <span
                                key={agent.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-[2px] text-[10.5px] text-muted-foreground"
                            >
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success/70" />
                                {agent.name}
                            </span>
                        ) : (
                            <Tooltip key={agent.id}>
                                <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning/[0.07] px-2 py-[2px] text-[10.5px] text-warning">
                                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
                                        {agent.name}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {agent.name} is offline — steps that land there will not dispatch
                                </TooltipContent>
                            </Tooltip>
                        )
                    ))
                )}
                {fleet.length > MAX_AGENT_CHIPS ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-[10.5px] tabular-nums text-muted-foreground/60">
                                +{fleet.length - MAX_AGENT_CHIPS}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {fleet.slice(MAX_AGENT_CHIPS).map((agent) => agent.name).join(', ')}
                        </TooltipContent>
                    </Tooltip>
                ) : null}
            </div>

            {/* How it is going */}
            <div className="flex items-center gap-3 border-t border-hairline px-4 py-2.5">
                <RunHistory runs={history} rate={successRate(pipeline)} now={now} />

                <p className={cn('min-w-0 flex-1 truncate text-[11px]', runStyle?.text ?? 'text-muted-foreground/60')}>
                    {caption(pipeline, now)}
                </p>

                <span className="shrink-0 text-[11.5px] tabular-nums text-foreground/90">
                    {next
                        ? formatUntil(next.getTime(), now)
                        : pipeline.status === 'active'
                            ? <span className="text-muted-foreground/60">on demand</span>
                            : <span className="text-muted-foreground/60">{PIPELINE_STATUS_STYLES[pipeline.status].label.toLowerCase()}</span>}
                </span>
            </div>
        </div>
    );
}

/**
 * The last few runs, as a small chart standing on a baseline.
 *
 * Height is duration and colour is outcome, which is one more fact than a row
 * of equal ticks carried and the one people actually watch for: a job creeping
 * from thirty seconds to four minutes is a problem well before it is a failure,
 * and it shows here as a staircase.
 *
 * The scale is a square root. Durations on a page like this differ by two
 * orders of magnitude, and on a linear scale one four-minute run flattens every
 * seven-second run beside it into the baseline.
 */
function RunHistory({ runs, rate, now }: { runs: PipelineRun[]; rate: number | null; now: number }) {
    if (runs.length === 0) return null;

    const durations = runs.map((run) => Math.max(runDuration(run, now), 0));
    const longest = Math.max(...durations, 1);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className="flex shrink-0 items-end gap-[3px] border-b border-hairline-strong pb-[3px] opacity-80 transition-opacity group-hover:opacity-100"
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
    );
}

/**
 * The one line in the footer.
 *
 * Shorter than it used to be, because the chain above has already said which
 * step failed and which never ran. What is left for words is when, and how
 * long — the two things a picture of a pipeline cannot show.
 */
function caption(pipeline: Pipeline, now: number): string {
    const run = latestRun(pipeline);
    if (!run) return pipeline.status === 'draft' ? 'Never run — still a draft' : 'Never run';

    switch (run.status) {
        case 'running': {
            const running = run.steps.find((step) => step.status === 'running');
            return running ? `Running “${running.name}”` : 'Running';
        }
        case 'queued':
            return 'Queued';
        case 'failed': {
            const failed = run.steps.find((step) => step.status === 'failed');
            const code = failed?.exit_code == null ? '' : ` · exit ${failed.exit_code}`;
            return `Failed ${formatRelativeTime(run.started_at, now)}${code}`;
        }
        case 'cancelled':
            return `Cancelled ${formatRelativeTime(run.started_at, now)}`;
        case 'succeeded':
            return `Succeeded ${formatRelativeTime(run.started_at, now)} in ${formatDuration(runDuration(run, now))}`;
    }
}
