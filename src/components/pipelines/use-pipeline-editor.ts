'use client';

import { useCallback, useMemo, useState } from 'react';

import {
    countSteps,
    findStep as findInTree,
    insertStep as insertIntoTree,
    moveStep as moveInTree,
    nudgeTarget,
    positionOf,
    removeStep as removeFromTree,
    updateStep as updateInTree,
    type DropPosition,
} from '@/lib/pipeline-tree';
import {
    describeSubject,
    flattenSteps,
    stepReferences,
    takesValue,
    type Pipeline,
    type PipelineAgent,
    type PipelineDraft,
    type PipelineStep,
    type PipelineTrigger,
    type StepFailurePolicy,
    type StepKind,
    type StepTarget,
} from '@/types/pipeline';

/**
 * The editable state behind the pipeline canvas.
 *
 * Kept out of the components because the canvas has three surfaces acting on
 * one document — a palette that inserts, a canvas that reorders, an inspector
 * that edits — and every one of them has to go through the same commit path or
 * undo stops being trustworthy. Every mutation here produces a whole new draft
 * and pushes the previous one onto the history stack; nothing mutates in place.
 */

/** A step's defaults, so a dropped node is runnable rather than merely present. */
export function blankStep(kind: StepKind, target: StepTarget): PipelineStep {
    const id = newStepId();

    if (kind === 'branch') {
        // Both arms start empty: a fork with a pre-filled path would be
        // guessing which way the person meant, and an empty arm is legal.
        return {
            id,
            kind: 'branch',
            name: 'If the previous step failed',
            input: { kind: 'previous' },
            match: 'all',
            // One rule to start, on the test people reach for most; an empty
            // condition would make the fork silently always take the first path.
            rules: [{
                id: `cnd-${Math.random().toString(36).slice(2, 8)}`,
                subject: { kind: 'status' },
                operator: 'is',
                value: 'failed',
            }],
            then: [],
            otherwise: [],
        };
    }

    const base = { id, target, timeout_secs: 300, on_failure: 'stop' as StepFailurePolicy };

    if (kind === 'command') {
        return { ...base, kind: 'command', name: 'Run a command', command: '', working_dir: null };
    }

    if (kind === 'http') {
        return { ...base, kind: 'http', name: 'HTTP request', method: 'GET', url: '', headers: [], body: null };
    }

    if (kind === 'convert') {
        return {
            ...base,
            kind: 'convert',
            name: 'Convert',
            input: { kind: 'previous' },
            from: 'xml',
            to: 'json',
            root_path: '',
            always_array: true,
        };
    }

    return {
        ...base,
        kind: 'transform',
        name: 'Transform',
        input: { kind: 'previous' },
        script: '-- `input` is the previous step output.\nreturn input',
    };
}

function newStepId(): string {
    return `st-${Math.random().toString(36).slice(2, 8)}`;
}

export function browserTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

/** A new pipeline: one fetch step, daily at 06:00 — the shape people start from. */
function emptyDraft(agents: PipelineAgent[]): PipelineDraft {
    const online = agents.find((agent) => agent.online) ?? agents[0];
    const target: StepTarget = online ? { kind: 'node', node_id: online.id } : { kind: 'all' };

    return {
        name: '',
        description: '',
        status: 'draft',
        trigger: { kind: 'cron', expression: '0 6 * * *', timezone: browserTimeZone() },
        steps: [blankStep('http', target)],
    };
}

export interface DraftProblems {
    /** Problems with the pipeline as a whole — name, schedule, no steps. */
    general: string[];
    /** Problems that belong to one step, so the node itself can show them. */
    byStep: Record<string, string[]>;
}

/**
 * Everything that would stop the pipeline running, attributed to the thing that
 * is wrong. Collected rather than thrown at the first failure, so a canvas with
 * three gaps is fixed in one pass — and attached per step, so the canvas marks
 * the node instead of making someone match a message to a box.
 */
export function validateDraft(draft: PipelineDraft, scheduleError: string | null): DraftProblems {
    const general: string[] = [];
    const byStep: Record<string, string[]> = {};

    if (draft.name.trim() === '') general.push('The pipeline needs a name.');
    if (scheduleError) general.push(scheduleError);
    if (draft.steps.length === 0) general.push('Drag at least one step onto the canvas.');

    for (const { step } of flattenSteps(draft.steps)) {
        const problems: string[] = [];

        if (step.name.trim() === '') problems.push('This step needs a name.');

        if (step.kind === 'command' && step.command.trim() === '') {
            problems.push('No command to run.');
        }

        if (step.kind === 'http') {
            const url = step.url.trim();
            if (url === '') {
                problems.push('No URL to request.');
            } else if (!/^https?:\/\//i.test(url)) {
                problems.push('The URL needs an http:// or https:// scheme.');
            }
            for (const header of step.headers) {
                if (header.name.trim() === '' && header.value.trim() !== '') {
                    problems.push('A header has a value but no name.');
                    break;
                }
            }
        }

        if (step.kind === 'transform' && step.script.trim() === '') {
            problems.push('No script to run.');
        }

        if (step.kind === 'branch') {
            // A fork with nothing on either side is not a decision, it is a
            // step that does nothing — and it is invisible in a run.
            if (step.then.length === 0 && step.otherwise.length === 0) {
                problems.push('Neither path has any steps.');
            }

            // No rules is not "always true" by anybody's intention: it is a
            // fork somebody started writing and left.
            if (step.rules.length === 0) {
                problems.push('Add at least one condition.');
            }

            for (const rule of step.rules) {
                if (rule.subject.kind === 'field' && rule.subject.path.trim() === '') {
                    problems.push('A condition names no field.');
                }
                if (!takesValue(rule.operator)) continue;

                if (rule.value.trim() === '') {
                    problems.push(`“${describeSubject(rule.subject)}” is compared with nothing.`);
                } else if (rule.operator === 'matches' && !isValidPattern(rule.value)) {
                    problems.push('A condition pattern is not a valid regular expression.');
                } else if (
                    (rule.operator === 'greater_than' || rule.operator === 'less_than')
                    && Number.isNaN(Number(rule.value))
                ) {
                    problems.push(`“${describeSubject(rule.subject)}” is compared with something that is not a number.`);
                }
            }
        } else if (step.timeout_secs < 1) {
            problems.push('The timeout must be at least a second.');
        }

        if (problems.length > 0) byStep[step.id] = problems;
    }

    return { general, byStep };
}

function isValidPattern(pattern: string): boolean {
    try {
        // eslint-disable-next-line no-new
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
}

/**
 * References a step makes to steps that do not precede it.
 *
 * A `{{ steps.x.output }}` pointing at a step that runs later — or at one that
 * was dragged away — resolves to nothing at run time, and the run then reports
 * a success carrying an empty value. Cheap to catch here; invisible otherwise.
 *
 * Order is definition order, which for a branch means both arms count as coming
 * after the fork. That is deliberately generous: only one arm actually runs, so
 * a reference across the two is a real hazard, but it is one the runner can
 * only resolve at run time and the editor should not refuse outright.
 */
export function danglingReferences(steps: PipelineStep[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const seen = new Set<string>();
    const flat = flattenSteps(steps);

    flat.forEach(({ step }, index) => {
        const bad: string[] = [];

        for (const reference of stepReferences(step)) {
            if (reference === 'input') {
                if (index === 0) bad.push('input');
                continue;
            }

            const id = reference.slice('steps.'.length, -'.output'.length);
            if (!seen.has(id)) bad.push(id);
        }

        if (bad.length > 0) result[step.id] = [...new Set(bad)];
        seen.add(step.id);
    });

    return result;
}

/** How deep undo goes. Beyond this the oldest states are dropped. */
const HISTORY_LIMIT = 50;

/**
 * Past, present and future in one value.
 *
 * State rather than refs: `canUndo` is rendered — a disabled Undo button that
 * only re-enables when something else happens to re-render is exactly the bug a
 * ref would introduce here. Keeping the three together also makes every
 * transition a single atomic update, so a fast undo/redo cannot interleave into
 * a history that has a present belonging to the wrong stack.
 */
interface History {
    past: PipelineDraft[];
    present: PipelineDraft;
    future: PipelineDraft[];
}

export function usePipelineEditor(pipeline: Pipeline | null, agents: PipelineAgent[]) {
    const initial = useMemo<PipelineDraft>(() => (
        pipeline
            ? {
                name: pipeline.name,
                description: pipeline.description,
                status: pipeline.status,
                trigger: pipeline.trigger,
                // Cloned so an abandoned edit cannot reach the stored pipeline
                // through a shared step object.
                steps: pipeline.steps.map((step) => ({ ...step })),
            }
            : emptyDraft(agents)
    ), [pipeline, agents]);

    const [history, setHistory] = useState<History>(() => ({ past: [], present: initial, future: [] }));
    const [selectedId, setSelectedId] = useState<string>(() => initial.steps[0]?.id ?? 'trigger');

    const draft = history.present;

    /** The single write path: every mutation lands here, so undo sees them all. */
    const commit = useCallback((next: PipelineDraft | ((prev: PipelineDraft) => PipelineDraft)) => {
        setHistory((current) => {
            const resolved = typeof next === 'function' ? next(current.present) : next;
            if (resolved === current.present) return current;

            return {
                past: [...current.past.slice(-(HISTORY_LIMIT - 1)), current.present],
                present: resolved,
                future: [],
            };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory((current) => {
            const previous = current.past[current.past.length - 1];
            if (!previous) return current;

            return {
                past: current.past.slice(0, -1),
                present: previous,
                future: [current.present, ...current.future],
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory((current) => {
            const [next, ...rest] = current.future;
            if (!next) return current;

            return { past: [...current.past, current.present], present: next, future: rest };
        });
    }, []);

    const insertStep = useCallback((kind: StepKind, position: DropPosition) => {
        const step = blankStep(kind, defaultTarget(draft.steps, agents));
        commit((prev) => ({ ...prev, steps: insertIntoTree(prev.steps, position, step) }));
        setSelectedId(step.id);
        return step;
    }, [agents, commit, draft.steps]);

    /** Moves a step to a position, guarding the moves that would lose a subtree. */
    const moveStep = useCallback((id: string, position: DropPosition) => {
        commit((prev) => {
            const next = moveInTree(prev.steps, id, position);
            // moveStep returns the original array for a refused move, and the
            // commit path treats an unchanged draft as nothing to undo.
            return next === prev.steps ? prev : { ...prev, steps: next };
        });
    }, [commit]);

    /**
     * Nudges a step one place up or down in canvas order.
     *
     * Canvas order, not array order: the arrows carry a step in and out of
     * branch paths exactly as the drop slots do, so a step alone on a path can
     * still be moved — which it could not be while the arrows were confined to
     * the array the step happened to live in.
     */
    const nudgeStep = useCallback((id: string, delta: -1 | 1) => {
        commit((prev) => {
            const target = nudgeTarget(prev.steps, id, delta);
            if (!target) return prev;

            const next = moveInTree(prev.steps, id, target);
            return next === prev.steps ? prev : { ...prev, steps: next };
        });
    }, [commit]);

    const removeStep = useCallback((id: string) => {
        const flat = flattenSteps(draft.steps).map((entry) => entry.step);
        const index = flat.findIndex((step) => step.id === id);
        const neighbour = flat[index + 1] ?? flat[index - 1];

        commit((prev) => ({ ...prev, steps: removeFromTree(prev.steps, id).steps }));
        setSelectedId((current) => (current === id ? neighbour?.id ?? 'trigger' : current));
    }, [commit, draft.steps]);

    const updateStep = useCallback((next: PipelineStep) => {
        commit((prev) => ({ ...prev, steps: updateInTree(prev.steps, next) }));
    }, [commit]);

    const duplicateStep = useCallback((id: string) => {
        const original = findInTree(draft.steps, id);
        const position = positionOf(draft.steps, id);
        if (!original || !position) return;

        const copy = cloneStep(original);
        commit((prev) => ({
            ...prev,
            steps: insertIntoTree(prev.steps, { ...position, index: position.index + 1 }, copy),
        }));
        setSelectedId(copy.id);
    }, [commit, draft.steps]);

    const setTrigger = useCallback((trigger: PipelineTrigger) => {
        commit((prev) => ({ ...prev, trigger }));
    }, [commit]);

    const setField = useCallback(<K extends keyof PipelineDraft>(key: K, value: PipelineDraft[K]) => {
        commit((prev) => ({ ...prev, [key]: value }));
    }, [commit]);

    return {
        draft,
        /**
         * Whether the draft differs from what was opened. Undoing all the way
         * back restores the original object, so this goes false again — which
         * is the right answer for the "discard changes?" guard.
         */
        dirty: draft !== initial,
        selectedId,
        select: setSelectedId,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        undo,
        redo,
        insertStep,
        moveStep,
        nudgeStep,
        removeStep,
        updateStep,
        duplicateStep,
        setTrigger,
        setField,
        /** Every step in the tree, in definition order, with its depth. */
        flat: flattenSteps(draft.steps),
        count: countSteps(draft.steps),
    };
}

/**
 * A copy of a step under fresh ids — including, for a branch, everything in
 * both arms. Reusing the ids would give two steps the same address, and a
 * `{{ steps.<id>.output }}` reference would then be ambiguous.
 */
function cloneStep(step: PipelineStep): PipelineStep {
    if (step.kind === 'branch') {
        return {
            ...step,
            id: newStepId(),
            name: `${step.name} copy`,
            then: step.then.map(cloneStep),
            otherwise: step.otherwise.map(cloneStep),
        };
    }

    return { ...step, id: newStepId(), name: `${step.name} copy` };
}

/** A new step inherits the last step's target: usually the same machine. */
function defaultTarget(steps: PipelineStep[], agents: PipelineAgent[]): StepTarget {
    const actions = flattenSteps(steps)
        .map((entry) => entry.step)
        .filter((step) => step.kind !== 'branch');
    const last = actions[actions.length - 1];
    if (last) return last.target;
    const online = agents.find((agent) => agent.online) ?? agents[0];
    return online ? { kind: 'node', node_id: online.id } : { kind: 'all' };
}
