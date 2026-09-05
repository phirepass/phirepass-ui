import {
    Ban,
    CheckCircle2,
    CircleDashed,
    Clock,
    Code2,
    FileJson,
    GitBranch,
    Globe,
    Loader2,
    LucideIcon,
    MinusCircle,
    Pause,
    PlugZap,
    Terminal,
    XCircle,
} from 'lucide-react';

import { describeCron, nextCronRun } from '@/lib/cron';
import {
    CONVERT_FORMAT_LABELS,
    describeCondition,
    flattenSteps,
    isActionStep,
    latestRun,
    type Pipeline,
    type PipelineAgent,
    type PipelineRun,
    type PipelineStatus,
    type PipelineStep,
    type StepKind,
    type StepRun,
    type StepRunStatus,
    type StepTarget,
} from '@/types/pipeline';


/** Per-status colouring, written out in full because Tailwind cannot resolve
 *  class names assembled at runtime. */
export const PIPELINE_STATUS_STYLES: Record<PipelineStatus, { dot: string; text: string; label: string }> = {
    active: { dot: 'bg-success', text: 'text-success', label: 'Active' },
    paused: { dot: 'bg-info', text: 'text-info', label: 'Paused' },
    draft: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', label: 'Draft' },
};

export const RUN_STATUS_STYLES: Record<StepRunStatus, { icon: LucideIcon; text: string; bar: string; label: string }> = {
    succeeded: { icon: CheckCircle2, text: 'text-success', bar: 'bg-success', label: 'Succeeded' },
    failed: { icon: XCircle, text: 'text-destructive', bar: 'bg-destructive', label: 'Failed' },
    running: { icon: Loader2, text: 'text-info', bar: 'bg-info', label: 'Running' },
    queued: { icon: Clock, text: 'text-muted-foreground', bar: 'bg-muted-foreground/40', label: 'Queued' },
    cancelled: { icon: Ban, text: 'text-warning', bar: 'bg-warning', label: 'Cancelled' },
    skipped: { icon: MinusCircle, text: 'text-muted-foreground', bar: 'bg-muted-foreground/25', label: 'Skipped' },
};

export const STEP_KIND_ICONS: Record<StepKind, LucideIcon> = {
    command: Terminal,
    http: Globe,
    convert: FileJson,
    transform: Code2,
    branch: GitBranch,
};

/**
 * A colour per kind, used identically in the palette, on the canvas and in the
 * run view — the tint is how a step is recognised before its name is read.
 * Written out in full because Tailwind cannot resolve names built at runtime.
 */
export const STEP_KIND_TONES: Record<StepKind, { well: string; icon: string }> = {
    command: { well: 'bg-white/[0.06]', icon: 'text-foreground' },
    http: { well: 'bg-info/10', icon: 'text-info' },
    convert: { well: 'bg-warning/10', icon: 'text-warning' },
    transform: { well: 'bg-violet/10', icon: 'text-violet' },
    branch: { well: 'bg-accent/10', icon: 'text-accent' },
};

/** For a pipeline that has never run: nothing to colour, but something to draw. */
export const NO_RUN_ICON = CircleDashed;

/**
 * Every duration helper takes the clock as an argument.
 *
 * The page holds one ticking `now` and threads it through, so that a screen of
 * countdowns advances in one step instead of each row reading the clock as it
 * happens to render — and so nothing computes a time during render, which is
 * both a lint rule here and the reason a server-rendered timestamp can differ
 * from the one the browser draws a moment later.
 */
export function formatRelativeTime(epochMs: number | null, now: number = Date.now()): string {
    if (epochMs === null) return 'never';

    const seconds = Math.max(0, Math.round((now - epochMs) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/** The same scale pointing forwards, for the next scheduled firing. */
export function formatUntil(epochMs: number | null, now: number = Date.now()): string {
    if (epochMs === null) return '—';

    const seconds = Math.max(0, Math.round((epochMs - now) / 1000));
    if (seconds < 60) return 'in under a minute';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
    return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatDuration(ms: number | null): string {
    if (ms === null) return '—';

    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Wall-clock time in the schedule's own zone — the zone the user wrote it in. */
export function formatInZone(epochMs: number, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat(undefined, {
            timeZone,
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(new Date(epochMs));
    } catch {
        return new Date(epochMs).toISOString().slice(0, 16).replace('T', ' ');
    }
}

/** How long a run took, or how long it has been going. */
export function runDuration(run: PipelineRun, now: number = Date.now()): number {
    return (run.finished_at ?? now) - run.started_at;
}

/** The same for one step, `null` for a step that never started. */
export function stepRunDuration(step: StepRun, now: number = Date.now()): number | null {
    if (step.started_at === null) return null;
    return (step.finished_at ?? now) - step.started_at;
}

/**
 * The one-line schedule summary a card shows.
 *
 * A manual pipeline gets a sentence rather than an empty slot: "no schedule" is
 * a deliberate configuration here, not a missing field.
 */
export function describeTrigger(pipeline: Pipeline): string {
    if (pipeline.trigger.kind === 'manual') return 'Manual runs only';
    return describeCron(pipeline.trigger.expression);
}

/**
 * When the pipeline fires next, or `null` when nothing will fire it.
 *
 * Paused and draft pipelines return `null` even though their expression is
 * perfectly valid — a schedule that is switched off has no next run, and
 * showing the time it *would* have fired reads as a promise.
 */
export function nextFiring(pipeline: Pipeline, from: Date = new Date()): Date | null {
    if (pipeline.status !== 'active' || pipeline.trigger.kind !== 'cron') return null;
    return nextCronRun(pipeline.trigger.expression, pipeline.trigger.timezone, from);
}

/**
 * How far through its steps a run got.
 *
 * `done` counts steps that will not change again — succeeded, failed, cancelled
 * or skipped — so a finished run always reads as complete regardless of how it
 * ended, and a running one advances a segment at a time. Written as counts
 * rather than a percentage because the bar draws one segment per step: a
 * pipeline with twenty steps has to stay legible, and a percentage would hide
 * exactly which of them stopped.
 */
export interface RunProgress {
    total: number;
    done: number;
    /** The step currently executing, if any. */
    running: StepRun | null;
    /** The step that failed, if the run failed. */
    failed: StepRun | null;
    /** Steps never reached, because an earlier failure stopped the run. */
    skipped: number;
}

export function runProgress(run: PipelineRun): RunProgress {
    const settled = new Set<StepRunStatus>(['succeeded', 'failed', 'cancelled', 'skipped']);

    return {
        total: run.steps.length,
        done: run.steps.filter((step) => settled.has(step.status)).length,
        running: run.steps.find((step) => step.status === 'running') ?? null,
        failed: run.steps.find((step) => step.status === 'failed') ?? null,
        skipped: run.steps.filter((step) => step.status === 'skipped').length,
    };
}

/**
 * The last runs, oldest first, for a strip of one bar per run.
 *
 * Only runs that happened. An earlier version padded the front with blanks so
 * every strip was the same width, which cost every row on the page a row of
 * grey stubs standing for nothing — and a pipeline that has never run drew
 * eight of them, reading as damage rather than as absence. The strip is
 * right-aligned instead, so the newest run still lands in the same column.
 */
export function recentRuns(pipeline: Pipeline, count: number): PipelineRun[] {
    return pipeline.runs.slice(0, count).reverse();
}

/** Success rate over the runs held, or `null` for a pipeline with no history. */
export function successRate(pipeline: Pipeline): number | null {
    const finished = pipeline.runs.filter((run) => run.status === 'succeeded' || run.status === 'failed');
    if (finished.length === 0) return null;
    const succeeded = finished.filter((run) => run.status === 'succeeded').length;
    return Math.round((succeeded / finished.length) * 100);
}

/** Short label for a step's kind and what it acts on, e.g. `GET · rss`. */
export function describeStep(step: PipelineStep): string {
    switch (step.kind) {
        case 'command':
            return step.command.split('\n')[0].trim() || 'no command yet';
        case 'http':
            return `${step.method} ${step.url.trim() || 'no URL yet'}`;
        case 'convert': {
            const at = step.root_path.trim();
            const conversion = `${CONVERT_FORMAT_LABELS[step.from]} → ${CONVERT_FORMAT_LABELS[step.to]}`;
            return at === '' ? conversion : `${conversion} · ${at}`;
        }
        case 'transform': {
            const lines = step.script.split('\n').length;
            return `Lua · ${lines} line${lines === 1 ? '' : 's'}`;
        }
        case 'branch':
            return `if ${describeCondition(step)}`;
    }
}


/**
 * Which agents a target currently comes to.
 *
 * A target is a *rule*, not a list: `tag: backup` is a promise about whatever
 * carries that tag at dispatch time, and `all` grows with the fleet. Every view
 * that wants to say "runs on db-01, nas-01" — the chain tooltip, the chips on a
 * card, the offline check below — has to resolve that rule the same way, so it
 * is resolved once here.
 *
 * Fleet order is preserved rather than sorted by name, so the same two agents
 * appear in the same order everywhere they are listed.
 */
export function targetAgents(target: StepTarget, agents: PipelineAgent[]): PipelineAgent[] {
    switch (target.kind) {
        case 'node':
            return agents.filter((agent) => agent.id === target.node_id);
        case 'tag':
            return agents.filter((agent) => agent.tags.includes(target.tag));
        case 'all':
            return agents;
    }
}

/**
 * Every agent the pipeline lands on, once each.
 *
 * Offline agents come first. The card only has room for a handful of chips
 * before it starts counting the rest, and the whole point of drawing them is to
 * show where the work goes — hiding the unreachable ones behind a `+4` would
 * spend the row on the agents that are fine.
 */
export function pipelineAgents(pipeline: Pipeline, agents: PipelineAgent[]): PipelineAgent[] {
    const reached = new Map<string, PipelineAgent>();

    for (const { step } of flattenSteps(pipeline.steps)) {
        if (!isActionStep(step)) continue;
        for (const agent of targetAgents(step.target, agents)) {
            reached.set(agent.id, agent);
        }
    }

    const fleet = [...reached.values()];
    return [...fleet.filter((agent) => !agent.online), ...fleet.filter((agent) => agent.online)];
}

/**
 * Steps that will not dispatch cleanly, because something they target is down.
 *
 * "At least one agent offline" rather than "all of them", because a step
 * targeting a tag is supposed to run on everything carrying it — a fleet-wide
 * step that reaches nine machines out of ten did not do what it was asked, and
 * a card that calls that healthy is a card nobody trusts the second time.
 */
export function offlineSteps(pipeline: Pipeline, agents: PipelineAgent[]): PipelineStep[] {
    return flattenSteps(pipeline.steps)
        .map(({ step }) => step)
        .filter((step) => isActionStep(step) && targetAgents(step.target, agents).some((agent) => !agent.online));
}

/**
 * What the badge on a pipeline says.
 *
 * Deliberately *not* `pipeline.status`: a pipeline can be perfectly "active"
 * and still be the reason you opened this page. A green mark on a card filed
 * under "Needs attention" is the list contradicting itself, so the badge
 * reports health — the last outcome, and whether the agents it needs are
 * reachable — and lifecycle only takes over once the schedule is switched off.
 */
export type Health = 'failing' | 'degraded' | 'running' | 'queued' | 'cancelled' | 'healthy' | 'never' | 'paused' | 'draft';

/**
 * A tinted well with an icon rather than a coloured dot, because this is the
 * one thing on a card that should be readable at arm's length: a 7px dot makes
 * a status *findable* once you already know where to look, and the difference
 * between "failed" and "an agent is offline" is not a difference of hue anyone
 * should have to learn. Written out in full because Tailwind cannot resolve
 * class names assembled at runtime.
 */
export const HEALTH_BADGES: Record<Health, { icon: LucideIcon; well: string; tone: string; spin?: boolean }> = {
    failing: { icon: XCircle, well: 'bg-destructive/12 ring-destructive/20', tone: 'text-destructive' },
    degraded: { icon: PlugZap, well: 'bg-warning/12 ring-warning/20', tone: 'text-warning' },
    running: { icon: Loader2, well: 'bg-info/12 ring-info/20', tone: 'text-info', spin: true },
    queued: { icon: Clock, well: 'bg-info/10 ring-info/15', tone: 'text-info' },
    cancelled: { icon: Ban, well: 'bg-warning/10 ring-warning/15', tone: 'text-warning' },
    healthy: { icon: CheckCircle2, well: 'bg-success/12 ring-success/20', tone: 'text-success' },
    never: { icon: CircleDashed, well: 'bg-white/[0.04] ring-white/[0.06]', tone: 'text-muted-foreground' },
    paused: { icon: Pause, well: 'bg-white/[0.04] ring-white/[0.06]', tone: 'text-muted-foreground' },
    draft: { icon: CircleDashed, well: 'bg-white/[0.03] ring-white/[0.05]', tone: 'text-muted-foreground/70' },
};

/** Lifecycle first once the schedule is off, health otherwise. */
export function resolveHealth(pipeline: Pipeline, agents: PipelineAgent[]): Health {
    if (pipeline.status === 'draft') return 'draft';
    if (pipeline.status === 'paused') return 'paused';

    const unreachable = offlineSteps(pipeline, agents).length > 0;
    const run = latestRun(pipeline);
    if (run === null) return unreachable ? 'degraded' : 'never';

    switch (run.status) {
        case 'failed': return 'failing';
        case 'running': return 'running';
        case 'queued': return 'queued';
        case 'cancelled': return 'cancelled';
        case 'succeeded': return unreachable ? 'degraded' : 'healthy';
    }
}

/** Whether this health is the kind a person has to do something about. */
export function needsAttention(health: Health): boolean {
    return health === 'failing' || health === 'degraded';
}

export function describeHealth(health: Health, offline: number): string {
    switch (health) {
        case 'failing': return 'The last run failed';
        case 'degraded': return offline === 1
            ? 'A step runs on an agent that is offline'
            : `${offline} steps run on agents that are offline`;
        case 'running': return 'Running now';
        case 'queued': return 'Queued, waiting for a runner';
        case 'cancelled': return 'The last run was cancelled';
        case 'healthy': return 'The last run succeeded';
        case 'never': return 'Never run';
        case 'paused': return 'Paused — the schedule will not fire';
        case 'draft': return 'Draft — not scheduled yet';
    }
}
