'use client';

import { useSyncExternalStore } from 'react';

import { createManualRun, createMockPipelines } from '@/data/mockPipelines';
import type { Pipeline, PipelineDraft } from '@/types/pipeline';

/**
 * The pipelines every pipeline surface reads.
 *
 * A module-level store rather than component state, because the list and the
 * editor are now separate routes: state held in the list page would be thrown
 * away the moment someone navigated to `/pipelines/new`, and the pipeline they
 * had just created would not be there when they came back.
 *
 * It stands in for the API and the query cache that will replace it — the
 * components call `savePipeline` and re-render, exactly as they would against a
 * mutation. Nothing is persisted: a full reload re-seeds the sample data, which
 * is the honest behaviour for a page with no server behind it.
 */

let pipelines: Pipeline[] | null = null;
const listeners = new Set<() => void>();

function ensureSeeded(): Pipeline[] {
    if (pipelines === null) {
        pipelines = createMockPipelines();
    }
    return pipelines;
}

function emit() {
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/**
 * Seeding happens on first read, and the sample data is built relative to
 * "now" — so the server would produce different timestamps from the browser.
 * The server snapshot is deliberately empty, and the page treats that as its
 * loading state until the client subscribes.
 */
const EMPTY: Pipeline[] = [];

export function usePipelines(): Pipeline[] {
    return useSyncExternalStore(subscribe, ensureSeeded, () => EMPTY);
}

export function usePipeline(id: string | null): Pipeline | null {
    const all = usePipelines();
    return id === null ? null : all.find((pipeline) => pipeline.id === id) ?? null;
}

/** Whether the store has been seeded on the client yet. */
export function useStoreReady(): boolean {
    return useSyncExternalStore(subscribe, () => pipelines !== null, () => false);
}

function write(next: Pipeline[]) {
    pipelines = next;
    emit();
}

/** Creates when `id` is null, replaces the definition otherwise. Returns the id. */
export function savePipeline(id: string | null, draft: PipelineDraft): string {
    const all = ensureSeeded();
    const now = Date.now();

    if (id) {
        write(all.map((pipeline) => (
            pipeline.id === id ? { ...pipeline, ...draft, updated_at: now } : pipeline
        )));
        return id;
    }

    const created: Pipeline = {
        id: `pl-${now.toString(36)}`,
        ...draft,
        created_at: now,
        updated_at: now,
        runs: [],
    };

    write([created, ...all]);
    return created.id;
}

export function deletePipeline(id: string) {
    write(ensureSeeded().filter((pipeline) => pipeline.id !== id));
}

export function setPipelineStatus(id: string, status: Pipeline['status']) {
    write(ensureSeeded().map((pipeline) => (
        pipeline.id === id ? { ...pipeline, status, updated_at: Date.now() } : pipeline
    )));
}

/**
 * Queues a run the way a real trigger would: the run exists immediately, every
 * step waiting, attributed to a person rather than to the schedule. Nothing
 * advances it, because nothing is listening.
 */
export function queueManualRun(id: string) {
    const all = ensureSeeded();
    const pipeline = all.find((entry) => entry.id === id);
    if (!pipeline) return;

    const run = createManualRun(pipeline);
    write(all.map((entry) => (entry.id === id ? { ...entry, runs: [run, ...entry.runs] } : entry)));
}
