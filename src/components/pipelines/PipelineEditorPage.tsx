'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    CalendarClock,
    ChevronLeft,
    Copy,
    CornerDownRight,
    GitBranch,
    GripVertical,
    Hand,
    Redo2,
    Trash2,
    Undo2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cronError, describeCron } from '@/lib/cron';
import { countSteps, type DropPosition } from '@/lib/pipeline-tree';
import { cn } from '@/lib/utils';
import { MOCK_AGENTS } from '@/data/mockPipelines';
import { savePipeline } from '@/components/pipelines/pipeline-store';
import {
    STEP_KIND_HINTS,
    STEP_KIND_LABELS,
    describeCondition,
    describeInput,
    describeTarget,
    type BranchStep,
    type Pipeline,
    type PipelineAgent,
    type PipelineDraft,
    type PipelineStep,
    type StepKind,
} from '@/types/pipeline';

import { StepInspector, TriggerInspector } from './PipelineInspector';
import { STEP_KIND_ICONS, STEP_KIND_TONES, describeStep } from './pipeline-display';
import {
    CANVAS_ATTRIBUTE,
    slotAttributes,
    type CanvasDrag,
    type DragPayload,
    useCanvasDrag,
} from './use-canvas-drag';
import { danglingReferences, usePipelineEditor, validateDraft } from './use-pipeline-editor';

/**
 * Every node on the canvas is this tall, whatever kind it is.
 *
 * A branch has no agent and no command line, so left to itself it renders two
 * lines against an action step's three and the column develops a ragged edge —
 * which reads as significance it does not have. So the height is fixed and each
 * kind fills its third line with whatever it does know: a branch says how the
 * two paths are populated.
 */
const NODE_HEIGHT = 'min-h-[4.5rem]';

/**
 * The pipeline editor, as a page rather than a dialog.
 *
 * A pipeline is a document — a canvas, a palette, an inspector, an undo stack —
 * and a dialog is a place to answer a question. At three panes wide the modal
 * was fighting for the viewport with the list it was covering, and every one of
 * its surfaces wanted more room. As a route it also gets what a document
 * expects: a URL you can return to, and a back button that means something.
 *
 * The canvas is a tree, not a list: a branch draws its two paths as indented
 * lanes below it, and steps drop into either one. Every drag gesture has a
 * pointer-free equivalent, because dragging cannot be the only way in.
 */

interface PipelineEditorPageProps {
    /** The pipeline being edited, or `null` to create a new one. */
    pipeline: Pipeline | null;
}

export function PipelineEditorPage({ pipeline }: PipelineEditorPageProps) {
    const router = useRouter();
    const agents = MOCK_AGENTS;
    const editor = usePipelineEditor(pipeline, agents);
    const { draft } = editor;

    /**
     * Problems stay quiet until the editor has been given a chance.
     *
     * A step dropped a second ago is incomplete by definition, and marking it
     * red before anything has been typed teaches people to ignore the marker.
     * The flag flips on the first save attempt and stays flipped, so from then
     * on the canvas tracks the draft live.
     */
    const [showProblems, setShowProblems] = useState(false);
    const [confirmingDiscard, setConfirmingDiscard] = useState(false);

    const scheduleError = draft.trigger.kind === 'cron' ? cronError(draft.trigger.expression) : null;
    const problems = useMemo(() => validateDraft(draft, scheduleError), [draft, scheduleError]);
    const dangling = useMemo(() => danglingReferences(draft.steps), [draft.steps]);
    const problemCount = problems.general.length
        + Object.values(problems.byStep).reduce((total, list) => total + list.length, 0);

    const selected = editor.flat.find((entry) => entry.step.id === editor.selectedId) ?? null;
    const selectedIndex = editor.flat.findIndex((entry) => entry.step.id === editor.selectedId);

    const handleDrop = useCallback((payload: DragPayload, position: DropPosition) => {
        if (payload.type === 'palette') {
            editor.insertStep(payload.kind, position);
        } else {
            editor.moveStep(payload.id, position);
        }
    }, [editor]);

    const drag = useCanvasDrag({ onDrop: handleDrop });

    // Leaving with unsaved work has to be interrupted on the paths this page
    // does not control either — a reload, or the browser's own back button.
    useEffect(() => {
        if (!editor.dirty) return;

        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [editor.dirty]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        const modifier = event.metaKey || event.ctrlKey;
        if (!modifier || event.key.toLowerCase() !== 'z') return;

        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
    };

    const save = (status: PipelineDraft['status']) => {
        const next = { ...draft, status };
        // A draft is unfinished by definition, so only the name is demanded of
        // it; anything that will actually be scheduled has to hold together.
        if (status === 'draft' ? next.name.trim() === '' : problemCount > 0) {
            setShowProblems(true);
            const firstBadStep = editor.flat.find((entry) => problems.byStep[entry.step.id]);
            if (firstBadStep) editor.select(firstBadStep.step.id);
            return;
        }

        savePipeline(pipeline?.id ?? null, next);
        toast.success(pipeline ? `Saved ${next.name}` : `Created ${next.name}`, {
            description: status === 'draft' ? 'Saved as a draft — it is not scheduled.' : undefined,
        });
        router.push('/dashboard/pipelines');
    };

    const leave = () => {
        if (editor.dirty && !confirmingDiscard) {
            setConfirmingDiscard(true);
            return;
        }
        router.push('/dashboard/pipelines');
    };

    return (
        <div
            className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden"
            onKeyDown={onKeyDown}
        >
            {/* Toolbar */}
            <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    aria-label="Back to pipelines"
                    onClick={leave}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="min-w-0 flex-1">
                    <Input
                        value={draft.name}
                        onChange={(event) => editor.setField('name', event.target.value)}
                        placeholder="Name this pipeline"
                        aria-label="Pipeline name"
                        className={cn(
                            'h-8 border-transparent bg-transparent px-0 text-[15px] font-semibold tracking-[-0.01em] shadow-none',
                            'focus-visible:border-hairline focus-visible:px-2.5',
                            showProblems && draft.name.trim() === '' && 'border-destructive/60 px-2.5'
                        )}
                    />
                    <Input
                        value={draft.description}
                        onChange={(event) => editor.setField('description', event.target.value)}
                        placeholder="What it does, and why it exists"
                        aria-label="Pipeline description"
                        className="h-6 border-transparent bg-transparent px-0 text-[12px] text-muted-foreground shadow-none focus-visible:border-hairline focus-visible:px-2.5"
                    />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Undo"
                                disabled={!editor.canUndo}
                                onClick={editor.undo}
                            >
                                <Undo2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Undo ⌘Z</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Redo"
                                disabled={!editor.canRedo}
                                onClick={editor.redo}
                            >
                                <Redo2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Redo ⇧⌘Z</TooltipContent>
                    </Tooltip>

                    <span aria-hidden className="mx-2 h-5 w-px bg-hairline" />

                    {confirmingDiscard ? (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmingDiscard(false)}>
                                Keep editing
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => router.push('/dashboard/pipelines')}
                            >
                                Discard
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => save('draft')}>
                                Save as draft
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => save(draft.status === 'draft' ? 'active' : draft.status)}
                            >
                                {pipeline ? 'Save' : 'Create'}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Palette, canvas, inspector */}
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_22rem]">
                <Palette
                    drag={drag}
                    onAppend={(kind) => editor.insertStep(kind, {
                        parentId: null,
                        lane: null,
                        index: draft.steps.length,
                    })}
                    status={
                        <Status
                            summary={`${editor.count} step${editor.count === 1 ? '' : 's'}`}
                            schedule={draft.trigger.kind === 'cron'
                                ? (scheduleError ? 'Schedule is invalid' : describeCron(draft.trigger.expression))
                                : 'Manual runs only'}
                            dirty={editor.dirty}
                            problem={showProblems && problemCount > 0
                                ? problems.general[0]
                                    ?? `${problemCount} thing${problemCount === 1 ? '' : 's'} to fix before this can run`
                                : null}
                            onShowProblem={() => {
                                // Jump to the first thing that is wrong rather
                                // than making someone hunt the canvas for it.
                                const firstBad = editor.flat.find((entry) => problems.byStep[entry.step.id]);
                                editor.select(firstBad?.step.id ?? 'trigger');
                            }}
                        />
                    }
                />

                <div
                    {...{ [CANVAS_ATTRIBUTE]: '' }}
                    className={cn(
                        'min-h-0 overflow-y-auto bg-black/[0.12] px-6 py-8',
                        drag.payload && 'cursor-grabbing'
                    )}
                >
                    <div className="mx-auto w-full max-w-xl pb-8">
                        <TriggerNode
                            draft={draft}
                            selected={editor.selectedId === 'trigger'}
                            invalid={showProblems && !!scheduleError}
                            onSelect={() => editor.select('trigger')}
                        />

                        <Rail />

                        <Flow
                            steps={draft.steps}
                            allSteps={draft.steps}
                            parentId={null}
                            lane={null}
                            agents={agents}
                            drag={drag}
                            selectedId={editor.selectedId}
                            problems={showProblems ? problems.byStep : {}}
                            dangling={dangling}
                            onSelect={editor.select}
                            onNudge={editor.nudgeStep}
                            onDuplicate={editor.duplicateStep}
                            onRemove={editor.removeStep}
                        />
                    </div>
                </div>

                <div className="min-h-0 overflow-y-auto border-t border-hairline px-5 py-5 xl:border-l xl:border-t-0">
                    {selected ? (
                        <StepInspector
                            step={selected.step}
                            index={selectedIndex}
                            agents={agents}
                            steps={draft.steps}
                            problems={showProblems ? problems.byStep[selected.step.id] ?? [] : []}
                            dangling={dangling[selected.step.id] ?? []}
                            onChange={editor.updateStep}
                        />
                    ) : (
                        <TriggerInspector
                            trigger={draft.trigger}
                            problems={scheduleError ? [scheduleError] : []}
                            onChange={editor.setTrigger}
                        />
                    )}
                </div>
            </div>

            <DragGhost drag={drag} />
        </div>
    );
}

/**
 * What is being dragged, drawn under the pointer.
 *
 * The browser's own drag image is a washed-out screenshot that cannot be
 * styled; this one matches the canvas, and — more usefully — it is the only
 * feedback a touch drag gets, where there is no cursor to look at.
 */
function DragGhost({ drag }: { drag: CanvasDrag }) {
    if (!drag.payload || !drag.pointer) return null;

    return (
        <div
            aria-hidden
            className="pointer-events-none fixed z-[1300] -translate-y-1/2 translate-x-3 rounded-xl border border-accent/60 bg-popover/95 px-3 py-2 text-[12px] font-medium text-foreground shadow-xl backdrop-blur"
            style={{ left: drag.pointer.x, top: drag.pointer.y }}
        >
            {drag.payload.label}
        </div>
    );
}

function Palette({
    drag,
    onAppend,
    status,
}: {
    drag: CanvasDrag;
    onAppend: (kind: StepKind) => void;
    /** The editor's state line, which lives at the foot of this column. */
    status: ReactNode;
}) {
    return (
        <div className="flex min-h-0 flex-col border-b border-hairline md:border-b-0 md:border-r">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-5">
                <p className="px-1 pb-1 text-[11px] font-semibold text-foreground/70">Library</p>

            {(Object.keys(STEP_KIND_LABELS) as StepKind[]).map((kind) => {
                const Icon = STEP_KIND_ICONS[kind];
                const tone = STEP_KIND_TONES[kind];
                const dragging = drag.payload?.type === 'palette' && drag.payload.kind === kind;

                return (
                    <button
                        key={kind}
                        type="button"
                        onPointerDown={(event) => drag.start(event, {
                            type: 'palette',
                            kind,
                            label: STEP_KIND_LABELS[kind],
                        })}
                        onClick={() => {
                            // A press that never became a drag is a click, and a
                            // click appends — the pointer-free path in.
                            if (!drag.payload) onAppend(kind);
                        }}
                        title={STEP_KIND_HINTS[kind]}
                        className={cn(
                            'flex w-full touch-none cursor-grab items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                            'hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                            'active:cursor-grabbing',
                            dragging && 'opacity-40'
                        )}
                    >
                        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] mac-squircle', tone.well, tone.icon)}>
                            <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 text-[13px] font-medium text-foreground">
                            {STEP_KIND_LABELS[kind]}
                        </span>
                    </button>
                );
            })}

                <p className="px-1 pt-2 text-[11px] leading-relaxed text-muted-foreground/70">
                    Drag onto the canvas, or click to add one at the end. Steps run top to bottom,
                    each receiving the previous one&apos;s output.
                </p>

            </div>

            {status}
        </div>
    );
}

/**
 * What the pipeline currently amounts to, at the foot of the library column.
 *
 * It sat in a bar across the bottom of the page, where it was a full-width
 * strip carrying one short sentence — and it pushed the canvas up by its own
 * height on every screen. Here it reads as the summary of the thing being
 * assembled, beside the parts it is assembled from.
 */
function Status({
    summary,
    schedule,
    dirty,
    problem,
    onShowProblem,
}: {
    summary: string;
    schedule: string;
    dirty: boolean;
    problem: string | null;
    onShowProblem: () => void;
}) {
    return (
        <div className="shrink-0 space-y-1.5 border-t border-hairline px-4 py-3">
            {problem ? (
                <button
                    type="button"
                    onClick={onShowProblem}
                    className="flex w-full items-start gap-1.5 text-left text-[11px] leading-snug text-destructive"
                >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {problem}
                </button>
            ) : (
                <>
                    <p className="text-[11px] font-medium text-foreground/80">{summary}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{schedule}</p>
                </>
            )}

            <p className="text-[11px] text-muted-foreground/60">
                {dirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
        </div>
    );
}

interface FlowProps {
    steps: PipelineStep[];
    /** The whole tree, for the labels that name a step in another container. */
    allSteps: PipelineStep[];
    parentId: string | null;
    lane: 'then' | 'otherwise' | null;
    agents: PipelineAgent[];
    drag: CanvasDrag;
    selectedId: string;
    problems: Record<string, string[]>;
    dangling: Record<string, string[]>;
    onSelect: (id: string) => void;
    onNudge: (id: string, delta: -1 | 1) => void;
    onDuplicate: (id: string) => void;
    onRemove: (id: string) => void;
}

/** One container of steps — the trunk, or one arm of a branch. */
function Flow(props: FlowProps) {
    const { steps, parentId, lane, drag } = props;
    const key = (index: number) => `${parentId ?? 'root'}:${lane ?? 'trunk'}:${index}`;

    return (
        <div className="flex flex-col">
            {steps.map((step, index) => (
                <div key={step.id}>
                    <Slot
                        drag={drag}
                        slotKey={key(index)}
                        position={{ parentId, lane, index }}
                    />
                    <Node {...props} step={step} index={index} />
                    {index < steps.length - 1 ? <Rail labelled /> : null}
                </div>
            ))}

            <Slot
                drag={drag}
                slotKey={key(steps.length)}
                position={{ parentId, lane, index: steps.length }}
                empty={steps.length === 0}
            />
        </div>
    );
}

/** A step, or a branch and the two lanes hanging off it. */
function Node(props: FlowProps & { step: PipelineStep; index: number }) {
    const { step } = props;

    if (step.kind !== 'branch') {
        return <StepNode {...props} step={step} />;
    }

    return (
        <div>
            <StepNode {...props} step={step} />
            <BranchLanes {...props} step={step} />
        </div>
    );
}

function BranchLanes(props: FlowProps & { step: BranchStep }) {
    const { step } = props;

    return (
        <div className="mt-2 space-y-3 border-l border-hairline-strong pl-4">
            <Lane
                {...props}
                lane="then"
                steps={step.then}
                parentId={step.id}
                label={`if ${describeCondition(step)}`}
                tone="text-success"
            />
            <Lane
                {...props}
                lane="otherwise"
                steps={step.otherwise}
                parentId={step.id}
                label="otherwise"
                tone="text-muted-foreground"
            />
        </div>
    );
}

function Lane(props: FlowProps & { label: string; tone: string }) {
    const { label, tone, ...flow } = props;

    return (
        <div className="space-y-1.5">
            <p className={cn('flex items-center gap-1.5 text-[11px] font-medium', tone)}>
                <CornerDownRight className="h-3 w-3" />
                {label}
            </p>
            <Flow {...flow} />
        </div>
    );
}

/**
 * Where a drop would land.
 *
 * Zero height at rest, so the canvas is a clean flow until something is being
 * dragged. An empty branch arm keeps a visible target instead, because a lane
 * with nothing in it has no other way to say it will accept a step.
 */
function Slot({
    drag,
    slotKey,
    position,
    empty = false,
}: {
    drag: CanvasDrag;
    slotKey: string;
    position: DropPosition;
    empty?: boolean;
}) {
    const active = drag.payload !== null && drag.activeSlot === slotKey;

    if (empty) {
        return (
            <div
                {...slotAttributes(slotKey, position)}
                className={cn(
                    'rounded-xl border border-dashed px-3 py-3 text-center text-[11px] transition-colors',
                    active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-hairline-strong text-muted-foreground/50'
                )}
            >
                {active ? 'Drop here' : 'No steps on this path'}
            </div>
        );
    }

    return (
        <div
            {...slotAttributes(slotKey, position)}
            aria-hidden
            className={cn(
                'overflow-hidden transition-all duration-150',
                active ? 'h-7 opacity-100' : 'h-0 opacity-0'
            )}
        >
            <div className="flex h-7 items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="h-px flex-1 bg-accent" />
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                    drop here
                </span>
            </div>
        </div>
    );
}

/** The line between two nodes; labelled ones state what travels along it. */
function Rail({ labelled = false }: { labelled?: boolean }) {
    return (
        <div className="relative flex h-6 items-center pl-[1.4rem]">
            <span aria-hidden className="absolute inset-y-0 left-[1.4rem] w-px bg-hairline-strong" />
            {labelled ? (
                <span className="relative ml-3 font-mono text-[10px] text-muted-foreground/50">
                    output → input
                </span>
            ) : null}
        </div>
    );
}

function TriggerNode({
    draft,
    selected,
    invalid,
    onSelect,
}: {
    draft: PipelineDraft;
    selected: boolean;
    invalid: boolean;
    onSelect: () => void;
}) {
    const cron = draft.trigger.kind === 'cron' ? draft.trigger : null;

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all',
                NODE_HEIGHT,
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                selected
                    ? 'border-accent/60 bg-accent/[0.08] ring-1 ring-accent/30'
                    : 'border-hairline bg-card/70 hover:bg-card',
                invalid && 'border-destructive/60'
            )}
        >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-accent/10 text-accent mac-squircle">
                {cron ? <CalendarClock className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">
                    {cron ? 'On a schedule' : 'When someone runs it'}
                </span>
                <span className={cn('block truncate text-[11px]', invalid ? 'text-destructive' : 'text-muted-foreground')}>
                    {cron
                        ? invalid
                            ? 'This schedule is not valid'
                            : describeCron(cron.expression)
                        : 'No schedule — started by hand'}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/60">
                    {cron ? cron.timezone : 'Run now, from the list'}
                </span>
            </span>
        </button>
    );
}

function StepNode({
    step,
    index,
    agents,
    allSteps,
    drag,
    selectedId,
    problems,
    dangling,
    onSelect,
    onNudge,
    onDuplicate,
    onRemove,
}: FlowProps & { step: PipelineStep; index: number }) {
    const Icon = STEP_KIND_ICONS[step.kind];
    const tone = STEP_KIND_TONES[step.kind];
    const selected = selectedId === step.id;
    const dragging = drag.payload?.type === 'step' && drag.payload.id === step.id;
    const stepProblems = problems[step.id] ?? [];
    const stepDangling = dangling[step.id] ?? [];
    const target = step.kind === 'branch' ? null : step.target;
    const agent = target?.kind === 'node'
        ? agents.find((entry) => entry.id === target.node_id)
        : undefined;

    return (
        <div
            onPointerDown={(event) => drag.start(event, { type: 'step', id: step.id, label: step.name })}
            onClick={() => onSelect(step.id)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(step.id);
                }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`Step ${index + 1}: ${step.name}`}
            className={cn(
                'group flex touch-none cursor-grab items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all active:cursor-grabbing',
                NODE_HEIGHT,
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                selected
                    ? 'border-accent/60 bg-accent/[0.08] ring-1 ring-accent/30'
                    : 'border-hairline bg-card/70 hover:bg-card',
                stepProblems.length > 0 && !selected && 'border-destructive/40',
                // The node stays in place while it is dragged, faded, so the
                // canvas never reflows under the pointer mid-gesture.
                dragging && 'opacity-30'
            )}
        >
            <GripVertical
                aria-hidden
                className="-ml-1.5 h-4 w-4 shrink-0 text-muted-foreground/30 transition-opacity group-hover:text-muted-foreground/60"
            />

            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] mac-squircle', tone.well, tone.icon)}>
                <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-foreground">{step.name}</span>
                    {stepProblems.length > 0 ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                            </TooltipTrigger>
                            <TooltipContent>{stepProblems.join(' ')}</TooltipContent>
                        </Tooltip>
                    ) : null}
                    {stepDangling.length > 0 ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-warning" />
                            </TooltipTrigger>
                            <TooltipContent>
                                {stepDangling.includes('input')
                                    ? 'Reads {{ input }}, but nothing runs before it'
                                    : `References ${stepDangling.join(', ')}, which does not run before this`}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                </div>

                <p className="truncate text-[11px] text-muted-foreground">
                    {step.kind === 'branch' ? (
                        <span className="flex items-center gap-1.5">
                            <GitBranch className="h-3 w-3 shrink-0" />
                            if {describeCondition(step)}
                        </span>
                    ) : (
                        <span className="font-mono">{describeStep(step)}</span>
                    )}
                </p>

                <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">
                    {step.kind === 'branch'
                        ? `${countSteps(step.then)} step${countSteps(step.then) === 1 ? '' : 's'} on the first path · ${countSteps(step.otherwise)} on the second`
                        : (
                            <>
                                on {describeTarget(step.target, agents)}
                                {agent && !agent.online ? <span className="text-warning"> · offline</span> : null}
                                {/* Said only when it is not the step above: the
                                    connector already draws the default, and would
                                    otherwise be drawing a lie. */}
                                {(step.kind === 'convert' || step.kind === 'transform')
                                    && step.input.kind === 'step'
                                    ? <span className="text-accent"> · reads {describeInput(step.input, allSteps)}</span>
                                    : null}
                            </>
                        )}
                </p>
            </div>

            {/* Everything dragging does, without a drag. */}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Move ${step.name} up`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onNudge(step.id, -1); }}
                >
                    <ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Move ${step.name} down`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onNudge(step.id, 1); }}
                >
                    <ChevronLeft className="h-3.5 w-3.5 -rotate-90" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Duplicate ${step.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onDuplicate(step.id); }}
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    aria-label={`Remove ${step.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onRemove(step.id); }}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}
