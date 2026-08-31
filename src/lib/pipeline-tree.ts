import type { BranchStep, PipelineStep } from '@/types/pipeline';

/**
 * Structural edits on a pipeline's step tree.
 *
 * Once a pipeline can branch, "insert a step" stops being an array splice: a
 * position is a container *and* an index, the container may be either arm of a
 * branch at any depth, and a move has to survive the fact that removing the
 * step shifts every index after it. Getting that wrong silently reorders
 * somebody's pipeline, so it lives here, pure and tested, rather than inline in
 * a drag handler.
 *
 * Every function returns new arrays; nothing is mutated in place, so React sees
 * a changed reference and the editor's undo stack keeps working by holding old
 * ones.
 */

/**
 * Where a step goes: which container, and which gap in it.
 *
 * `parentId === null` is the trunk. Otherwise it names a branch, and `lane`
 * says which of its two arms. `index` counts gaps, so `0` is before the first
 * step and `length` is after the last.
 */
export interface DropPosition {
    parentId: string | null;
    lane: 'then' | 'otherwise' | null;
    index: number;
}

/** The lane of a branch a position addresses. */
function laneOf(branch: BranchStep, lane: 'then' | 'otherwise' | null): PipelineStep[] {
    return lane === 'otherwise' ? branch.otherwise : branch.then;
}

function withLane(branch: BranchStep, lane: 'then' | 'otherwise' | null, steps: PipelineStep[]): BranchStep {
    return lane === 'otherwise' ? { ...branch, otherwise: steps } : { ...branch, then: steps };
}

/** Inserts `step` at `position`, returning a new tree. */
export function insertStep(
    steps: PipelineStep[],
    position: DropPosition,
    step: PipelineStep
): PipelineStep[] {
    if (position.parentId === null) {
        const index = clamp(position.index, steps.length);
        return [...steps.slice(0, index), step, ...steps.slice(index)];
    }

    return steps.map((entry) => {
        if (entry.kind !== 'branch') return entry;

        if (entry.id === position.parentId) {
            const lane = laneOf(entry, position.lane);
            const index = clamp(position.index, lane.length);
            return withLane(entry, position.lane, [...lane.slice(0, index), step, ...lane.slice(index)]);
        }

        return {
            ...entry,
            then: insertStep(entry.then, position, step),
            otherwise: insertStep(entry.otherwise, position, step),
        };
    });
}

/** Removes the step with `id`, returning the new tree and what came out. */
export function removeStep(
    steps: PipelineStep[],
    id: string
): { steps: PipelineStep[]; removed: PipelineStep | null } {
    let removed: PipelineStep | null = null;

    const walk = (list: PipelineStep[]): PipelineStep[] => list.flatMap<PipelineStep>((entry) => {
        if (entry.id === id) {
            removed = entry;
            return [];
        }

        if (entry.kind !== 'branch') return [entry];

        return [{ ...entry, then: walk(entry.then), otherwise: walk(entry.otherwise) }];
    });

    return { steps: walk(steps), removed };
}

/** Replaces the step with `next.id`, leaving the tree's shape alone. */
export function updateStep(steps: PipelineStep[], next: PipelineStep): PipelineStep[] {
    return steps.map((entry) => {
        if (entry.id === next.id) return next;
        if (entry.kind !== 'branch') return entry;

        return {
            ...entry,
            then: updateStep(entry.then, next),
            otherwise: updateStep(entry.otherwise, next),
        };
    });
}

export function findStep(steps: PipelineStep[], id: string): PipelineStep | null {
    for (const entry of steps) {
        if (entry.id === id) return entry;
        if (entry.kind !== 'branch') continue;

        const found = findStep(entry.then, id) ?? findStep(entry.otherwise, id);
        if (found) return found;
    }

    return null;
}

/** Where a step currently sits, or `null` if it is not in the tree. */
export function positionOf(steps: PipelineStep[], id: string): DropPosition | null {
    const walk = (list: PipelineStep[], parentId: string | null, lane: 'then' | 'otherwise' | null): DropPosition | null => {
        const index = list.findIndex((entry) => entry.id === id);
        if (index !== -1) return { parentId, lane, index };

        for (const entry of list) {
            if (entry.kind !== 'branch') continue;
            const found = walk(entry.then, entry.id, 'then') ?? walk(entry.otherwise, entry.id, 'otherwise');
            if (found) return found;
        }

        return null;
    };

    return walk(steps, null, null);
}

/** Whether `id` is `step` itself or anywhere inside it. */
export function containsStep(step: PipelineStep, id: string): boolean {
    if (step.id === id) return true;
    if (step.kind !== 'branch') return false;

    return [...step.then, ...step.otherwise].some((child) => containsStep(child, id));
}

/**
 * Moves the step with `id` to `position`.
 *
 * Two things make this more than remove-then-insert. A branch cannot be dropped
 * into one of its own arms — that would detach the whole subtree from the tree
 * and lose it — so such a move is refused and the original returned. And when
 * the step is moving within the container it is already in, lifting it out
 * shifts every later gap down by one, which is corrected here so that dropping
 * a step into the gap just below itself is the no-op it looks like.
 */
export function moveStep(steps: PipelineStep[], id: string, position: DropPosition): PipelineStep[] {
    const moving = findStep(steps, id);
    if (!moving) return steps;

    if (position.parentId !== null && containsStep(moving, position.parentId)) {
        return steps;
    }

    const from = positionOf(steps, id);
    const { steps: without, removed } = removeStep(steps, id);
    if (!removed) return steps;

    const sameContainer = from !== null
        && from.parentId === position.parentId
        && from.lane === position.lane;

    const index = sameContainer && position.index > from.index
        ? position.index - 1
        : position.index;

    return insertStep(without, { ...position, index }, removed);
}

/**
 * Every insertion gap in the tree, in the order the canvas draws them.
 *
 * The trunk's gaps interleave with each branch's, because a branch's two paths
 * are drawn *between* the fork and whatever follows it: after the gap before a
 * branch comes the branch, then its first path top to bottom, then its second,
 * then the gap after it. This is the same order the drop slots are rendered in,
 * which is what makes dragging and the arrow buttons agree about what "the next
 * position down" means.
 */
export function dropSlots(steps: PipelineStep[]): DropPosition[] {
    const walk = (
        list: PipelineStep[],
        parentId: string | null,
        lane: 'then' | 'otherwise' | null
    ): DropPosition[] => {
        const slots: DropPosition[] = [];

        list.forEach((step, index) => {
            slots.push({ parentId, lane, index });

            if (step.kind === 'branch') {
                slots.push(...walk(step.then, step.id, 'then'));
                slots.push(...walk(step.otherwise, step.id, 'otherwise'));
            }
        });

        slots.push({ parentId, lane, index: list.length });
        return slots;
    };

    return walk(steps, null, null);
}

/**
 * Where a step goes when it is nudged one place up or down.
 *
 * "One place" is a position in the canvas order above, not an index in the
 * array the step happens to live in — so the first step of a branch path moves
 * up and out to sit above the fork, and a trunk step moves down *into* the path
 * below it. Keeping the arrows inside one container instead made them dead
 * buttons for any step that was alone on a path, which is most of them.
 *
 * Returns `null` when there is nowhere to go: the step is already first or last
 * in the whole pipeline.
 */
export function nudgeTarget(
    steps: PipelineStep[],
    id: string,
    delta: -1 | 1
): DropPosition | null {
    const step = findStep(steps, id);
    const from = positionOf(steps, id);
    if (!step || !from) return null;

    const slots = dropSlots(steps);
    const at = slots.findIndex((slot) => same(slot, from));
    if (at === -1) return null;

    // A step's own two gaps — the one it sits in and the one just after it —
    // both put it back where it started, so neither counts as a move.
    const skip = (slot: DropPosition) => (
        same(slot, from)
        || same(slot, { ...from, index: from.index + 1 })
        // A branch cannot be dropped inside itself; stepping over its own
        // paths is what lets a fork move past the steps it contains.
        || (slot.parentId !== null && containsStep(step, slot.parentId))
    );

    for (let index = at + delta; index >= 0 && index < slots.length; index += delta) {
        if (!skip(slots[index])) return slots[index];
    }

    return null;
}

function same(a: DropPosition, b: DropPosition): boolean {
    return a.parentId === b.parentId && a.lane === b.lane && a.index === b.index;
}

/** Total steps in the tree, branches included. */
export function countSteps(steps: PipelineStep[]): number {
    return steps.reduce((total, step) => (
        step.kind === 'branch'
            ? total + 1 + countSteps(step.then) + countSteps(step.otherwise)
            : total + 1
    ), 0);
}

function clamp(index: number, length: number): number {
    return Math.max(0, Math.min(index, length));
}
