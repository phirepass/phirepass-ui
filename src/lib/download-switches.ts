/**
 * The Downloads and Torrents switches on a node (screen F), as pure rules.
 *
 * Each switch is a service of kind `FETCH` or `TORRENT` with nothing to dial
 * (port 0): on creates it, off deletes it. Having them be services is what
 * makes them configuration (only someone who may configure the node can flip
 * them) and what lets a share include or leave out each one. The node's mode
 * follows from which exist: none is off, `FETCH` alone is links only, both is
 * everything.
 *
 * No imports, so `download-switches.test.ts` runs under the bare `node --test`
 * runner, like `share-services.ts`.
 *
 * Not here yet (T1.21): asking for the download folder in the same step, and
 * holding the switch off until the node accepts the folder.
 */

export type DownloadSwitch = 'FETCH' | 'TORRENT';

export interface SwitchState {
    downloads: boolean;
    torrents: boolean;
}

export type SwitchStep = { op: 'create' | 'remove'; kind: DownloadSwitch };

/** The switches as a node's per-kind service counts describe them. */
export function switchState(services: Readonly<Record<string, number>> | undefined): SwitchState {
    const has = (kind: DownloadSwitch) => (services?.[kind] ?? 0) > 0;
    return { downloads: has('FETCH'), torrents: has('TORRENT') };
}

/**
 * The service changes that flip `kind` to `on`, in order.
 *
 * Torrents need Downloads: the node refuses a `TORRENT` service without a
 * `FETCH` one, and refuses removing `FETCH` while `TORRENT` exists, so turning
 * Downloads off removes Torrents first. Asking for what is already true is no
 * steps, and turning Torrents on while Downloads is off is refused here rather
 * than sent.
 */
export function switchSteps(state: SwitchState, kind: DownloadSwitch, on: boolean): SwitchStep[] {
    if (kind === 'FETCH') {
        if (on) {
            return state.downloads ? [] : [{ op: 'create', kind: 'FETCH' }];
        }
        const steps: SwitchStep[] = [];
        if (state.torrents) steps.push({ op: 'remove', kind: 'TORRENT' });
        if (state.downloads) steps.push({ op: 'remove', kind: 'FETCH' });
        return steps;
    }

    if (on) {
        if (!state.downloads) {
            throw new Error('Turn Downloads on before Torrents.');
        }
        return state.torrents ? [] : [{ op: 'create', kind: 'TORRENT' }];
    }
    return state.torrents ? [{ op: 'remove', kind: 'TORRENT' }] : [];
}

/** The state after `steps` succeed. */
export function applySteps(state: SwitchState, steps: readonly SwitchStep[]): SwitchState {
    const next = { ...state };
    for (const step of steps) {
        if (step.kind === 'FETCH') next.downloads = step.op === 'create';
        else next.torrents = step.op === 'create';
    }
    return next;
}

/**
 * Which question to ask before flipping, if any.
 *
 * - `K7` every time Torrents go from off to on: the node will show its address
 *   to public peers and seed until a download is deleted.
 * - `K6` when Downloads go off while downloads are running, so the person
 *   knows they keep running. With nothing running the switch flips silently.
 *
 * Turning Torrents off, or Downloads on, asks nothing.
 */
export function confirmationFor(
    state: SwitchState,
    kind: DownloadSwitch,
    on: boolean,
    running: number,
): 'K6' | 'K7' | null {
    if (kind === 'TORRENT' && on && !state.torrents) return 'K7';
    if (kind === 'FETCH' && !on && state.downloads && running > 0) return 'K6';
    return null;
}

/** "2 downloads are running", for K6 and the node card. */
export function runningLabel(running: number): string {
    return running === 1 ? '1 download running' : `${running} downloads running`;
}

export type DownloadPolicy = 'allowed' | 'links_only' | 'blocked';

/**
 * Why a switch cannot be turned on under the organisation's policy (L2), or
 * null. Only on: a switch that is on where the policy forbids it (the server
 * has not caught up yet) can still be turned off. `org` names who to ask.
 */
export function policyLock(policy: DownloadPolicy | undefined, kind: DownloadSwitch, org: string): string | null {
    if (policy === 'blocked') {
        return kind === 'FETCH'
            ? `Blocked by your organisation. Ask an owner or admin of ${org}.`
            : 'Needs Downloads.';
    }
    if (policy === 'links_only' && kind === 'TORRENT') {
        return `Your organisation allows only links on this node. Ask an owner or admin of ${org}.`;
    }
    return null;
}
