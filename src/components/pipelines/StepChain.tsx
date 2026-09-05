'use client';

import { Fragment } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    describeTarget,
    flattenSteps,
    isActionStep,
    type BranchStep,
    type PipelineAgent,
    type PipelineRun,
    type PipelineStep,
    type StepRun,
    type StepRunStatus,
    type StepTarget,
} from '@/types/pipeline';

import {
    RUN_STATUS_STYLES,
    STEP_KIND_ICONS,
    STEP_KIND_TONES,
    describeStep,
    formatDuration,
    stepRunDuration,
    targetAgents,
} from './pipeline-display';

/** Trunk steps drawn before the chain gives up and counts the rest. */
const MAX_TRUNK = 5;

/** Steps drawn per arm of a fork. Two is enough to show the arm is not empty. */
const MAX_ARM = 2;

/**
 * How a step's last outcome is drawn onto its node.
 *
 * A ring rather than a fill, because the fill is already spoken for: it carries
 * the *kind* of the step, which is what tells one pipeline from another at a
 * glance and is the same in every view of this app. Outcome is the layer on
 * top — it changes every run, the kind does not.
 */
const OUTCOME_RINGS: Record<StepRunStatus, string> = {
    succeeded: 'ring-success/45',
    failed: 'ring-destructive/80',
    running: 'ring-info/70',
    queued: 'ring-info/25',
    cancelled: 'ring-warning/50',
    skipped: 'ring-white/[0.05]',
};

/** The line between two nodes, tinted by what the run did with it. */
const LINKS: Record<'idle' | 'passed' | 'stopped' | 'skipped', string> = {
    idle: 'bg-white/[0.09]',
    passed: 'bg-success/35',
    stopped: 'bg-destructive/45',
    skipped: 'bg-white/[0.05]',
};

interface StepChainProps {
    steps: PipelineStep[];
    /** The run to paint onto the chain, or `null` to draw it unrun. */
    run: PipelineRun | null;
    agents: PipelineAgent[];
}

/**
 * A pipeline's steps, drawn as the chain they are.
 *
 * This is the card's whole reason to exist. A list of schedules can tell you
 * that six pipelines run tonight; it cannot tell you that one of them fetches a
 * feed, reshapes it and posts it to Slack while another shells into a NAS —
 * and that is the difference people actually navigate by. So the steps get the
 * hero slot, in the same kind-colours and icons the editor canvas uses, and the
 * last run is painted *onto* them rather than summarised beside them: the node
 * that failed is the red one, and the ones after it are visibly the ones that
 * never got their turn.
 *
 * Long pipelines are truncated rather than shrunk. Twenty nodes at any legible
 * size is a diagram, not a card, and the fifth one already tells you what kind
 * of work this is; the rest are a count and a click.
 */
export function StepChain({ steps, run, agents }: StepChainProps) {
    if (steps.length === 0) {
        return (
            <p className="py-4 text-[11.5px] text-muted-foreground/60">
                No steps yet — this pipeline would do nothing.
            </p>
        );
    }

    const trunk = steps.slice(0, MAX_TRUNK);

    let drawn = 0;
    for (const step of trunk) {
        drawn += 1;
        if (step.kind === 'branch') {
            drawn += Math.min(step.then.length, MAX_ARM) + Math.min(step.otherwise.length, MAX_ARM);
        }
    }
    const hidden = flattenSteps(steps).length - drawn;

    const runOf = (step: PipelineStep): StepRun | null =>
        run?.steps.find((entry) => entry.step_id === step.id) ?? null;

    return (
        // Centred, with links that stretch a little: a two-step pipeline should
        // read as a composed card rather than as a chain that ran out of room,
        // and a five-step one still packs to its natural width.
        <div className="flex items-start justify-center">
            {trunk.map((step, index) => (
                <Fragment key={step.id}>
                    {index > 0 ? <Link state={linkState(runOf(trunk[index - 1]), runOf(step))} /> : null}
                    {step.kind === 'branch'
                        ? <Fork branch={step} runOf={runOf} agents={agents} />
                        : <Node step={step} stepRun={runOf(step)} agents={agents} />}
                </Fragment>
            ))}

            {hidden > 0 ? (
                <>
                    <Link state="idle" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex w-[4.25rem] shrink-0 flex-col items-center">
                                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-dashed border-white/[0.12] text-[11px] tabular-nums text-muted-foreground/70">
                                    +{hidden}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {hidden} more step{hidden === 1 ? '' : 's'} — open the pipeline to see them
                        </TooltipContent>
                    </Tooltip>
                </>
            ) : null}
        </div>
    );
}

/**
 * One step: a tinted well carrying its kind's icon, its name under it, and the
 * agent it lands on under that.
 *
 * The target line is there because "runs on nas-01" is half of what a step *is*
 * on this product — the same command against a different box is a different
 * job — and because a chain that names its agents makes an offline one findable
 * without opening anything.
 */
function Node({
    step,
    stepRun,
    agents,
}: {
    step: PipelineStep;
    stepRun: StepRun | null;
    agents: PipelineAgent[];
}) {
    const Icon = STEP_KIND_ICONS[step.kind];
    const tone = STEP_KIND_TONES[step.kind];
    const outcome = stepRun?.status ?? null;
    const target = isActionStep(step) ? step.target : null;
    const offline = target !== null
        && target.kind === 'node'
        && agents.some((agent) => agent.id === target.node_id && !agent.online);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className={cn(
                        'flex w-[4.25rem] shrink-0 flex-col items-center text-center',
                        outcome === 'skipped' && 'opacity-45'
                    )}
                >
                    <span
                        className={cn(
                            'relative flex h-11 w-11 items-center justify-center rounded-[14px] ring-1 ring-inset',
                            tone.well,
                            outcome ? OUTCOME_RINGS[outcome] : 'ring-white/[0.07]'
                        )}
                    >
                        <Icon className={cn('h-[18px] w-[18px]', tone.icon)} />

                        {/* The one node worth finding on a failed card gets a
                            mark that survives being glanced at. */}
                        {outcome === 'failed' || outcome === 'running' ? (
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                                    outcome === 'failed' ? 'bg-destructive' : 'bg-info animate-pulse'
                                )}
                            />
                        ) : null}
                        {offline ? (
                            <span
                                aria-hidden
                                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-card"
                            />
                        ) : null}
                    </span>

                    <span className="mt-2 line-clamp-2 min-h-[1.85rem] px-0.5 text-[10.5px] leading-[0.92rem] text-muted-foreground">
                        {step.name}
                    </span>
                    <span className="max-w-full truncate text-[9.5px] leading-tight text-muted-foreground/45">
                        {target === null ? 'server' : describeTarget(target, agents)}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[18rem]">
                <span className="font-medium">{step.name}</span>
                <br />
                <span className="font-mono text-[11px]">{describeStep(step)}</span>
                <br />
                {stepRun
                    ? `${RUN_STATUS_STYLES[stepRun.status].label}${
                        stepRunDuration(stepRun) === null ? '' : ` in ${formatDuration(stepRunDuration(stepRun))}`
                    }${stepRun.node_name ? ` on ${stepRun.node_name}` : ''}`
                    : 'Not run'}
                {target === null ? null : <><br />{describeReach(target, agents)}</>}
            </TooltipContent>
        </Tooltip>
    );
}

/**
 * A branch and its two arms.
 *
 * Drawn as a real fork, because that is the one thing about a pipeline that a
 * straight line genuinely cannot say. Arm steps are icon-only: the fork is
 * there to show the shape — that there *is* a second path and roughly what is
 * on it — and giving every arm step the full name-and-agent treatment makes a
 * conditional pipeline three times the height of a linear one for no extra
 * answer.
 */
function Fork({
    branch,
    runOf,
    agents,
}: {
    branch: BranchStep;
    runOf: (step: PipelineStep) => StepRun | null;
    agents: PipelineAgent[];
}) {
    const branchRun = runOf(branch);
    const taken = branchRun?.taken ?? null;

    return (
        <div className="flex items-start">
            <Node step={branch} stepRun={branchRun} agents={agents} />

            <div className="relative mt-1 flex flex-col gap-1.5 border-l border-hairline-strong pl-2.5">
                <Arm
                    label="yes"
                    steps={branch.then}
                    runOf={runOf}
                    agents={agents}
                    dimmed={taken === 'otherwise'}
                />
                {branch.otherwise.length > 0 ? (
                    <Arm
                        label="no"
                        steps={branch.otherwise}
                        runOf={runOf}
                        agents={agents}
                        dimmed={taken === 'then'}
                    />
                ) : null}
            </div>
        </div>
    );
}

function Arm({
    label,
    steps,
    runOf,
    agents,
    dimmed,
}: {
    label: string;
    steps: PipelineStep[];
    runOf: (step: PipelineStep) => StepRun | null;
    agents: PipelineAgent[];
    /** The path the run did not take, held back so the taken one reads first. */
    dimmed: boolean;
}) {
    const shown = steps.slice(0, MAX_ARM);
    const rest = steps.length - shown.length;

    return (
        <div className={cn('flex items-center gap-1.5', dimmed && 'opacity-35')}>
            <span aria-hidden className="-ml-2.5 h-px w-2.5 shrink-0 bg-hairline-strong" />
            <span className="w-5 shrink-0 text-[9px] uppercase tracking-[0.06em] text-muted-foreground/45">
                {label}
            </span>
            {shown.map((step, index) => (
                <Fragment key={step.id}>
                    {index > 0 ? <span aria-hidden className="h-px w-2 shrink-0 bg-white/[0.09]" /> : null}
                    <ArmNode step={step} stepRun={runOf(step)} agents={agents} />
                </Fragment>
            ))}
            {rest > 0 ? (
                <span className="text-[9.5px] tabular-nums text-muted-foreground/45">+{rest}</span>
            ) : null}
        </div>
    );
}

function ArmNode({
    step,
    stepRun,
    agents,
}: {
    step: PipelineStep;
    stepRun: StepRun | null;
    agents: PipelineAgent[];
}) {
    const Icon = STEP_KIND_ICONS[step.kind];
    const tone = STEP_KIND_TONES[step.kind];
    const outcome = stepRun?.status ?? null;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ring-1 ring-inset',
                        tone.well,
                        outcome ? OUTCOME_RINGS[outcome] : 'ring-white/[0.07]'
                    )}
                >
                    <Icon className={cn('h-3.5 w-3.5', tone.icon)} />
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[18rem]">
                <span className="font-medium">{step.name}</span>
                <br />
                <span className="font-mono text-[11px]">{describeStep(step)}</span>
                <br />
                {stepRun ? RUN_STATUS_STYLES[stepRun.status].label : 'Not run'}
                {isActionStep(step) ? <><br />{describeReach(step.target, agents)}</> : null}
            </TooltipContent>
        </Tooltip>
    );
}

function Link({ state }: { state: keyof typeof LINKS }) {
    return (
        <span
            aria-hidden
            className={cn('mt-[21px] h-[2px] min-w-4 max-w-16 flex-1 rounded-full', LINKS[state])}
        />
    );
}

/** What the run did between two steps: carried on, stopped, or never arrived. */
function linkState(from: StepRun | null, to: StepRun | null): keyof typeof LINKS {
    if (from === null && to === null) return 'idle';
    if (to?.status === 'skipped' || from?.status === 'failed') {
        return from?.status === 'failed' ? 'stopped' : 'skipped';
    }
    if (from?.status === 'succeeded') return 'passed';
    return 'idle';
}

/**
 * "Runs on db-01, nas-01" — the machines, not the rule that picked them.
 *
 * A step's target is resolved at dispatch, so `tag: backup` is a promise about
 * whatever carries that tag tonight. The chain shows the rule under each node
 * because that is what was configured; the tooltip shows what it currently
 * comes to, which is the part that can surprise you.
 */
function describeReach(target: StepTarget, agents: PipelineAgent[]) {
    const resolved = targetAgents(target, agents);

    if (resolved.length === 0) {
        return <span className="text-warning">Runs on nothing — {describeTarget(target, agents)} matches no agent</span>;
    }

    return (
        <>
            Runs on{' '}
            {resolved.map((agent, index) => (
                <Fragment key={agent.id}>
                    {index > 0 ? ', ' : null}
                    <span className={agent.online ? undefined : 'text-warning'}>{agent.name}</span>
                </Fragment>
            ))}
        </>
    );
}
