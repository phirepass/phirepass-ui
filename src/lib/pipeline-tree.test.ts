import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BranchStep, CommandStep, PipelineStep } from '../types/pipeline.ts';
import {
    containsStep,
    countSteps,
    dropSlots,
    insertStep,
    moveStep,
    nudgeTarget,
    positionOf,
    removeStep,
    updateStep,
} from './pipeline-tree.ts';

function command(id: string): CommandStep {
    return {
        id,
        kind: 'command',
        name: id,
        command: `echo ${id}`,
        working_dir: null,
        target: { kind: 'all' },
        timeout_secs: 60,
        on_failure: 'stop',
    };
}

function branch(id: string, then: PipelineStep[] = [], otherwise: PipelineStep[] = []): BranchStep {
    return {
        id,
        kind: 'branch',
        name: id,
        input: { kind: 'previous' },
        match: 'all',
        rules: [{ id: `${id}-rule`, subject: { kind: 'status' }, operator: 'is', value: 'failed' }],
        then,
        otherwise,
    };
}

/** ids in definition order, so a tree can be asserted on one line. */
function shape(steps: PipelineStep[]): string {
    return steps.map((step) => (
        step.kind === 'branch'
            ? `${step.id}(then:${shape(step.then)}|else:${shape(step.otherwise)})`
            : step.id
    )).join(',');
}

const TREE: PipelineStep[] = [
    command('a'),
    branch('b', [command('c'), command('d')], [command('e')]),
    command('f'),
];

test('a step inserts into the trunk at the gap given', () => {
    const next = insertStep(TREE, { parentId: null, lane: null, index: 1 }, command('x'));
    assert.equal(shape(next), 'a,x,b(then:c,d|else:e),f');
});

test('a step inserts into either arm of a branch', () => {
    const then = insertStep(TREE, { parentId: 'b', lane: 'then', index: 1 }, command('x'));
    assert.equal(shape(then), 'a,b(then:c,x,d|else:e),f');

    const otherwise = insertStep(TREE, { parentId: 'b', lane: 'otherwise', index: 0 }, command('x'));
    assert.equal(shape(otherwise), 'a,b(then:c,d|else:x,e),f');
});

test('an index past the end lands at the end rather than out of bounds', () => {
    const next = insertStep(TREE, { parentId: 'b', lane: 'then', index: 99 }, command('x'));
    assert.equal(shape(next), 'a,b(then:c,d,x|else:e),f');
});

test('removing a nested step leaves the rest of the tree alone', () => {
    const { steps, removed } = removeStep(TREE, 'd');
    assert.equal(shape(steps), 'a,b(then:c|else:e),f');
    assert.equal(removed?.id, 'd');
});

/** Deleting a fork deletes what it holds — the arms have nowhere else to go. */
test('removing a branch removes its children with it', () => {
    const { steps, removed } = removeStep(TREE, 'b');
    assert.equal(shape(steps), 'a,f');
    assert.equal(removed?.kind, 'branch');
});

test('removing something absent changes nothing', () => {
    const { steps, removed } = removeStep(TREE, 'nope');
    assert.equal(shape(steps), shape(TREE));
    assert.equal(removed, null);
});

test('a step is found and located wherever it sits', () => {
    assert.deepEqual(positionOf(TREE, 'a'), { parentId: null, lane: null, index: 0 });
    assert.deepEqual(positionOf(TREE, 'd'), { parentId: 'b', lane: 'then', index: 1 });
    assert.deepEqual(positionOf(TREE, 'e'), { parentId: 'b', lane: 'otherwise', index: 0 });
    assert.equal(positionOf(TREE, 'nope'), null);
});

test('update replaces one step without touching the shape', () => {
    const next = updateStep(TREE, { ...command('d'), name: 'renamed' });
    assert.equal(shape(next), shape(TREE));
    const found = next.find((step) => step.kind === 'branch') as BranchStep;
    assert.equal(found.then[1].name, 'renamed');
});

test('a step moves from a branch out to the trunk', () => {
    const next = moveStep(TREE, 'c', { parentId: null, lane: null, index: 0 });
    assert.equal(shape(next), 'c,a,b(then:d|else:e),f');
});

test('a step moves from the trunk into a branch arm', () => {
    const next = moveStep(TREE, 'f', { parentId: 'b', lane: 'otherwise', index: 0 });
    assert.equal(shape(next), 'a,b(then:c,d|else:f,e)');
});

/**
 * The index correction. Dropping a step into the gap directly below itself is
 * where it already is; without the shift it would appear to jump forward one.
 */
test('dropping a step into the gap just below itself is a no-op', () => {
    const next = moveStep(TREE, 'a', { parentId: null, lane: null, index: 1 });
    assert.equal(shape(next), shape(TREE));
});

test('moving forward past later steps lands where the gap was drawn', () => {
    const next = moveStep(TREE, 'a', { parentId: null, lane: null, index: 3 });
    assert.equal(shape(next), 'b(then:c,d|else:e),f,a');
});

test('moving backwards needs no correction', () => {
    const next = moveStep(TREE, 'f', { parentId: null, lane: null, index: 0 });
    assert.equal(shape(next), 'f,a,b(then:c,d|else:e)');
});

/** The move that would detach the tree from itself. */
test('a branch cannot be dropped inside its own arm', () => {
    const next = moveStep(TREE, 'b', { parentId: 'b', lane: 'then', index: 0 });
    assert.equal(shape(next), shape(TREE));
});

test('a branch cannot be dropped inside a branch nested within it', () => {
    const nested: PipelineStep[] = [branch('outer', [branch('inner')])];
    const next = moveStep(nested, 'outer', { parentId: 'inner', lane: 'then', index: 0 });
    assert.equal(shape(next), shape(nested));
});

test('a branch moves normally when the target is outside it', () => {
    const next = moveStep(TREE, 'b', { parentId: null, lane: null, index: 0 });
    assert.equal(shape(next), 'b(then:c,d|else:e),a,f');
});

test('containment sees through both arms and any depth', () => {
    const outer = branch('outer', [branch('inner', [command('deep')])]);
    assert.equal(containsStep(outer, 'deep'), true);
    assert.equal(containsStep(outer, 'outer'), true);
    assert.equal(containsStep(outer, 'elsewhere'), false);
});

test('the count includes branches and everything under them', () => {
    assert.equal(countSteps(TREE), 6);
    assert.equal(countSteps([]), 0);
});

/** Editing must never write through to the tree the editor was opened on. */
test('every operation leaves the original tree untouched', () => {
    const before = shape(TREE);
    insertStep(TREE, { parentId: 'b', lane: 'then', index: 0 }, command('x'));
    removeStep(TREE, 'c');
    moveStep(TREE, 'a', { parentId: 'b', lane: 'then', index: 0 });
    updateStep(TREE, { ...command('a'), name: 'changed' });
    assert.equal(shape(TREE), before);
});

/** Nudging is expressed as a move to the position the arrow points at. */
function nudge(steps: PipelineStep[], id: string, delta: -1 | 1): string {
    const target = nudgeTarget(steps, id, delta);
    return target === null ? shape(steps) : shape(moveStep(steps, id, target));
}

test('the drop slots run in the order the canvas draws them', () => {
    // Trunk gap, a, gap, b, b's two paths, gap after b, f, final gap.
    assert.deepEqual(
        dropSlots(TREE).map((slot) => `${slot.parentId ?? '-'}/${slot.lane ?? '-'}/${slot.index}`),
        [
            '-/-/0',
            '-/-/1',
            'b/then/0', 'b/then/1', 'b/then/2',
            'b/otherwise/0', 'b/otherwise/1',
            '-/-/2',
            '-/-/3',
        ]
    );
});

/**
 * One place up is one row up *on screen*, so a trunk step below a fork lands at
 * the end of the path drawn directly above it rather than skipping the whole
 * branch. The arrows and the drop slots then agree about what is adjacent.
 */
test('a step below a fork nudges up into the path above it', () => {
    assert.equal(nudge(TREE, 'f', -1), 'a,b(then:c,d|else:e,f)');
});

test('nudging down and back up returns a step to where it started', () => {
    assert.equal(nudge(nudgeOnce(TREE, 'a', 1), 'a', -1), shape(TREE));
});

/** The case the arrows used to be dead for: a step alone on a branch path. */
test('the first step of a path nudges up and out, above the fork', () => {
    assert.equal(nudge(TREE, 'c', -1), 'a,c,b(then:d|else:e),f');
    assert.equal(nudge(TREE, 'e', -1), 'a,b(then:c,d,e|else:),f');
});

test('the last step of the first path nudges down into the second', () => {
    assert.equal(nudge(TREE, 'd', 1), 'a,b(then:c|else:d,e),f');
});

test('the last step of the last path nudges down and out, below the fork', () => {
    assert.equal(nudge(TREE, 'e', 1), 'a,b(then:c,d|else:),e,f');
});

test('a trunk step nudges down into the path below it', () => {
    assert.equal(nudge(TREE, 'a', 1), 'b(then:a,c,d|else:e),f');
});

test('a trunk step nudges up out of nothing at the top', () => {
    assert.equal(nudgeTarget(TREE, 'a', -1), null);
    assert.equal(nudge(TREE, 'a', -1), shape(TREE));
});

test('the last step in the pipeline has nowhere further down', () => {
    assert.equal(nudgeTarget(TREE, 'f', 1), null);
    assert.equal(nudge(TREE, 'f', 1), shape(TREE));
});

/** A fork steps over everything it contains rather than into it. */
test('nudging a branch moves it past its own paths', () => {
    assert.equal(nudge(TREE, 'b', 1), 'a,f,b(then:c,d|else:e)');
    assert.equal(nudge(TREE, 'b', -1), 'b(then:c,d|else:e),a,f');
});

test('nudging something absent does nothing', () => {
    assert.equal(nudgeTarget(TREE, 'nope', 1), null);
});

function nudgeOnce(steps: PipelineStep[], id: string, delta: -1 | 1): PipelineStep[] {
    const target = nudgeTarget(steps, id, delta);
    return target === null ? steps : moveStep(steps, id, target);
}
