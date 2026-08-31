'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { flattenSteps, type PipelineRun, type PipelineStep } from '@/types/pipeline';

import { RUN_STATUS_STYLES, formatDuration } from './pipeline-display';

/**
 * One pipeline's steps as a single bar: a segment per step, coloured by how
 * that step went on the run being shown.
 *
 * A segment rather than a card per step, because the step count is not bounded —
 * three steps and twenty have to look equally deliberate, and twenty chips do
 * not. Segments simply get thinner, the colours still read from across the
 * room, and the one segment anybody cares about (the one that failed, or the
 * one running now) is the one that is picked out.
 *
 * With no run to show it draws the shape of the pipeline in neutral, which is
 * the honest rendering of "this has never run" — not an empty bar, and not a
 * green one.
 *
 * The tree is flattened first, so a pipeline that branches draws a segment for
 * every step it contains rather than only the ones on the trunk — otherwise the
 * bar and the "6 steps" beside it disagree, and the two paths of a fork are
 * invisible. Every segment is the same height, including the ones inside a
 * branch: a bar with steps of two heights reads as a chart of some second
 * quantity, which there isn't. Depth shows as a slightly dimmer segment, and
 * the tooltip says which path it is on.
 */
export function StepProgressBar({
    steps,
    run,
    className,
    height = 'h-2',
}: {
    steps: PipelineStep[];
    /** The run to colour by, or `null` to draw the pipeline unrun. */
    run: PipelineRun | null;
    className?: string;
    height?: string;
}) {
    const flat = flattenSteps(steps);

    if (flat.length === 0) {
        return <div className={cn('rounded-full bg-secondary', height, className)} />;
    }

    return (
        <div className={cn('flex items-stretch gap-[2px]', className)}>
            {flat.map(({ step, depth }, index) => {
                const stepRun = run?.steps.find((entry) => entry.step_id === step.id);
                const style = stepRun ? RUN_STATUS_STYLES[stepRun.status] : null;
                const active = stepRun?.status === 'running';
                const duration = stepRun?.started_at != null && stepRun.finished_at != null
                    ? stepRun.finished_at - stepRun.started_at
                    : null;

                return (
                    <Tooltip key={step.id}>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    'min-w-[5px] flex-1 rounded-[3px] transition-[opacity,transform] hover:opacity-70',
                                    height,
                                    style?.bar ?? 'bg-secondary',
                                    depth > 0 && 'opacity-55',
                                    // The step in flight is the one thing on the
                                    // bar that is still changing; it says so.
                                    active && 'animate-pulse'
                                )}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <span className="font-medium">{index + 1}. {step.name}</span>
                            {depth > 0 ? <span className="text-muted-foreground"> · on a branch path</span> : null}
                            <br />
                            {stepRun
                                ? `${RUN_STATUS_STYLES[stepRun.status].label}${duration === null ? '' : ` in ${formatDuration(duration)}`}`
                                : 'Not run'}
                            {stepRun?.node_name ? (
                                <>
                                    <br />
                                    on {stepRun.node_name}
                                </>
                            ) : null}
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}
