'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, CornerDownRight, Hand, Timer } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { nextCronRuns } from '@/lib/cron';
import { cn } from '@/lib/utils';
import {
    FAILURE_POLICY_LABELS,
    STEP_KIND_LABELS,
    describeCondition,
    describeTarget,
    type Pipeline,
    type PipelineAgent,
    type PipelineRun,
    type PipelineStep,
    type StepRun,
} from '@/types/pipeline';

import { StepProgressBar } from './StepProgressBar';
import {
    PIPELINE_STATUS_STYLES,
    RUN_STATUS_STYLES,
    STEP_KIND_ICONS,
    STEP_KIND_TONES,
    formatDuration,
    formatInZone,
    formatRelativeTime,
    formatUntil,
    runDuration,
    stepRunDuration,
} from './pipeline-display';

interface PipelineDetailDialogProps {
    pipeline: Pipeline | null;
    agents: PipelineAgent[];
    onClose: () => void;
}

/** How many firings the schedule tab previews. Enough to see a weekly pattern. */
const PREVIEW_RUNS = 6;

export function PipelineDetailDialog({ pipeline, agents, onClose }: PipelineDetailDialogProps) {
    if (!pipeline) return null;

    const statusStyle = PIPELINE_STATUS_STYLES[pipeline.status];

    return (
        <Dialog open={!!pipeline} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', statusStyle.dot)} />
                        {pipeline.name}
                        <span className={cn('text-sm font-medium', statusStyle.text)}>{statusStyle.label}</span>
                    </DialogTitle>
                    <DialogDescription>{pipeline.description}</DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="steps">
                    <TabsList className="w-full justify-start">
                        <TabsTrigger value="steps">Steps</TabsTrigger>
                        <TabsTrigger value="runs">Runs ({pipeline.runs.length})</TabsTrigger>
                        <TabsTrigger value="schedule">Schedule</TabsTrigger>
                    </TabsList>

                    <TabsContent value="steps" className="space-y-3 pt-4">
                        {pipeline.steps.map((step, index) => (
                            <StepDefinition key={step.id} step={step} index={index} agents={agents} />
                        ))}
                    </TabsContent>

                    <TabsContent value="runs" className="space-y-3 pt-4">
                        {pipeline.runs.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                This pipeline has never run.
                            </p>
                        ) : (
                            pipeline.runs.map((run) => (
                                <RunRow key={run.id} run={run} steps={pipeline.steps} />
                            ))
                        )}
                    </TabsContent>

                    <TabsContent value="schedule" className="space-y-4 pt-4">
                        <SchedulePanel pipeline={pipeline} />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

function StepDefinition({ step, index, agents, depth = 0 }: {
    step: PipelineStep;
    index: number;
    agents: PipelineAgent[];
    depth?: number;
}) {
    const KindIcon = STEP_KIND_ICONS[step.kind];
    const tone = STEP_KIND_TONES[step.kind];

    return (
        <div style={{ marginLeft: depth * 16 }} className="space-y-3">
            <div className="rounded-xl border border-hairline bg-card/60 p-4">
                <div className="flex items-start gap-3">
                    <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] mac-squircle', tone.well, tone.icon)}>
                        <KindIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-[10px] text-muted-foreground/60">{index + 1}</span>
                            <span className="text-[13px] font-medium text-foreground">{step.name}</span>
                            <span className="text-[11px] text-muted-foreground">
                                {step.kind === 'branch'
                                    ? STEP_KIND_LABELS.branch
                                    : `on ${describeTarget(step.target, agents)}`}
                            </span>
                        </div>

                        {step.kind === 'branch' ? (
                            <p className="mt-1.5 text-[12px] text-muted-foreground">
                                Takes the first path when {describeCondition(step)}.
                            </p>
                        ) : (
                            <>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                    {step.kind === 'command' ? step.command : null}
                                    {step.kind === 'transform' ? step.script : null}
                                    {step.kind === 'http' ? httpPreview(step) : null}
                                </pre>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Timer className="h-3 w-3" />
                                        {step.timeout_secs}s timeout
                                    </span>
                                    <span>On failure: {FAILURE_POLICY_LABELS[step.on_failure].toLowerCase()}</span>
                                    {step.kind === 'command' && step.working_dir ? (
                                        <span className="font-mono">cwd {step.working_dir}</span>
                                    ) : null}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* A branch's paths are drawn under it, indented, in the order the
                runner would consider them. */}
            {step.kind === 'branch' ? (
                <div className="space-y-3 border-l border-hairline-strong pl-4">
                    <BranchPath
                        label={`if ${describeCondition(step)}`}
                        tone="text-success"
                        steps={step.then}
                        agents={agents}
                        depth={depth}
                    />
                    <BranchPath
                        label="otherwise"
                        tone="text-muted-foreground"
                        steps={step.otherwise}
                        agents={agents}
                        depth={depth}
                    />
                </div>
            ) : null}
        </div>
    );
}

function BranchPath({ label, tone, steps, agents, depth }: {
    label: string;
    tone: string;
    steps: PipelineStep[];
    agents: PipelineAgent[];
    depth: number;
}) {
    return (
        <div className="space-y-2">
            <p className={cn('flex items-center gap-1.5 text-[11px] font-medium', tone)}>
                <CornerDownRight className="h-3 w-3" />
                {label}
            </p>
            {steps.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60">No steps on this path.</p>
            ) : (
                steps.map((child, index) => (
                    <StepDefinition
                        key={child.id}
                        step={child}
                        index={index}
                        agents={agents}
                        depth={depth}
                    />
                ))
            )}
        </div>
    );
}

/** The request as it goes on the wire, which is the form people can read. */
function httpPreview(step: Extract<PipelineStep, { kind: 'http' }>): string {
    const lines = [`${step.method} ${step.url}`];
    for (const header of step.headers) {
        lines.push(`${header.name}: ${header.value}`);
    }
    if (step.body) {
        lines.push('', step.body);
    }
    return lines.join('\n');
}

function RunRow({ run, steps }: { run: PipelineRun; steps: PipelineStep[] }) {
    const [open, setOpen] = useState(false);
    const style = RUN_STATUS_STYLES[run.status];
    const Icon = style.icon;

    return (
        <div className="rounded-lg border border-hairline bg-card/60">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                aria-expanded={open}
            >
                {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Icon className={cn('h-4 w-4 shrink-0', style.text, run.status === 'running' && 'animate-spin')} />
                <span className={cn('text-sm font-medium', style.text)}>{style.label}</span>
                <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">{run.id}</span>
                {/* The same bar the lane draws, so a run reads identically here. */}
                <StepProgressBar
                    steps={steps}
                    run={run}
                    height="h-1.5"
                    className="hidden w-28 shrink-0 md:flex"
                />
                <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                        {run.trigger === 'manual' ? <Hand className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {run.trigger === 'manual' ? 'by hand' : 'scheduled'}
                    </span>
                    <span>{formatDuration(runDuration(run))}</span>
                    <span>{formatRelativeTime(run.started_at)}</span>
                </span>
            </button>

            {open ? (
                <div className="space-y-2 border-t border-hairline px-4 py-3">
                    {run.steps.map((step) => <StepRunRow key={step.step_id} step={step} />)}
                </div>
            ) : null}
        </div>
    );
}

function StepRunRow({ step }: { step: StepRun }) {
    const style = RUN_STATUS_STYLES[step.status];
    const Icon = style.icon;
    const duration = stepRunDuration(step);

    return (
        <div className="rounded-md bg-black/20 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', style.text, step.status === 'running' && 'animate-spin')} />
                <span className="font-medium text-foreground">{step.name}</span>
                {step.node_name ? (
                    <span className="text-[11px] text-muted-foreground">on {step.node_name}</span>
                ) : null}
                <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                    {step.exit_code === null ? null : <span className="font-mono">exit {step.exit_code}</span>}
                    {duration === null ? null : <span>{formatDuration(duration)}</span>}
                </span>
            </div>

            {step.logs.length > 0 ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {step.logs.join('\n')}
                </pre>
            ) : null}

            {/* The value handed to the next step, kept visually distinct from the
                logs: a run can succeed and still pass on the wrong thing. */}
            {step.output ? (
                <p className="mt-2 flex items-start gap-1.5 truncate font-mono text-[11px] text-accent/90">
                    <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="truncate">{step.output}</span>
                </p>
            ) : null}
        </div>
    );
}

function SchedulePanel({ pipeline }: { pipeline: Pipeline }) {
    if (pipeline.trigger.kind === 'manual') {
        return (
            <p className="rounded-lg border border-hairline bg-card/60 px-4 py-3 text-sm text-muted-foreground">
                No schedule. This pipeline runs only when someone starts it.
            </p>
        );
    }

    const { expression, timezone } = pipeline.trigger;
    const upcoming = nextCronRuns(expression, timezone, PREVIEW_RUNS);

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-hairline bg-card/60 px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                    <span className="font-mono text-sm text-foreground">{expression}</span>
                    <span className="text-[11px] text-muted-foreground">{timezone}</span>
                </div>
            </div>

            <div>
                <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                    Next {PREVIEW_RUNS} firings
                    {pipeline.status === 'active' ? '' : ' — the schedule is not running while this pipeline is paused'}
                </p>
                <div className="rounded-lg border border-hairline bg-card/60 px-3 py-1">
                    {upcoming.map((date) => (
                        <div
                            key={date.toISOString()}
                            className={cn(
                                'flex items-baseline justify-between gap-4 border-b border-hairline py-1.5 last:border-0',
                                pipeline.status !== 'active' && 'opacity-60'
                            )}
                        >
                            <span className="font-mono text-sm text-foreground">
                                {formatInZone(date.getTime(), timezone)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{formatUntil(date.getTime())}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
