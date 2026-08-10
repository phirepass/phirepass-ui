import { useSyncExternalStore } from 'react';

/**
 * The wall clock as an external store.
 *
 * Components that render "3 minutes ago" depend on a value that changes without
 * any React state changing, so reading `Date.now()` during render is both impure
 * and silently stale. Subscribing instead makes the dependency explicit and
 * keeps those labels ticking.
 *
 * One interval is shared by every subscriber, and it only runs while something
 * is mounted.
 */
const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let snapshot = Date.now();

function subscribe(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange);

    if (intervalId === null) {
        intervalId = setInterval(() => {
            snapshot = Date.now();
            for (const listener of listeners) {
                listener();
            }
        }, TICK_MS);
    }

    return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0 && intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}

function getSnapshot(): number {
    return snapshot;
}

export function useNow(): number {
    // The server snapshot is the module's load time. Every caller renders inside
    // a list that is empty until its data arrives client-side, so no relative
    // label is ever produced during SSR and there is nothing to mismatch.
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
