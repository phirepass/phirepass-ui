/**
 * The Downloads page's rules (screen U1), as pure functions over plain data:
 * how a row reads, how rows group under nodes, what the summary line counts,
 * and how a live `DownloadProgress` frame changes the list.
 *
 * No imports, so `download-display.test.ts` runs under the bare `node --test`
 * runner. The job shape is the subset of `FetchJob`
 * (`common/src/protocol/fetch.rs`, `phirepass-widgets/src/common/fetch.ts`)
 * this page reads. A Rust `None` arrives as an absent field, so every optional
 * field is read with `??`.
 *
 * The rule the page exists to show: **nothing fails by itself.** A download on
 * an offline node waits, and says so; an error becomes Retrying with its reason
 * and the next attempt.
 */

export type JobState =
    | 'Queued' | 'Scheduled' | 'Resolving' | 'FetchingMetadata' | 'Downloading' | 'Verifying'
    | 'Paused' | 'Retrying' | 'Seeding' | 'Completed' | 'Stopped' | 'Cancelled' | 'Deleted' | 'Unknown';

export interface JobView {
    download_id: string;
    kind: string;
    name: string;
    state: JobState;
    done_bytes: number;
    total_bytes?: number | null;
    down_bps: number;
    up_bps: number;
    peers: number;
    finished_at?: number | null;
    reason?: string | null;
    pause_reason?: string | null;
    retry_reason?: string | null;
    attempt: number;
    next_attempt_at?: number | null;
    /** A Delete is pending: the node has not said Deleted yet. */
    deleting?: boolean;
}

export interface DownloadItem {
    nodeId: string;
    job: JobView;
}

/** One row of `GET /api/downloads`. Numbers may come back as strings (bigint). */
export interface DownloadApiRow {
    id: string;
    node_id: string;
    wanted?: string;
    state: string;
    job: Partial<JobView> | null;
    done_bytes: number | string;
    total_bytes: number | string | null;
    down_bps: number | string;
    up_bps: number | string;
    peers: number;
    attempt: number;
    retry_reason: string | null;
    next_attempt_at: string | null;
    finished_at: string | null;
}

export interface NodeView {
    id: string;
    name: string;
    online: boolean;
    /** Unix ms of the last sign of life, when known. */
    lastSeen?: number | null;
}

/** States the node is still working on. Seeding is finished work and does not count. */
const ACTIVE: ReadonlySet<JobState> = new Set([
    'Queued', 'Scheduled', 'Resolving', 'FetchingMetadata', 'Downloading', 'Verifying', 'Paused', 'Retrying',
]);

export function isActive(job: JobView): boolean {
    return ACTIVE.has(job.state);
}

const num = (value: number | string | null | undefined): number | null =>
    value === null || value === undefined || value === '' ? null : Number(value);

const ms = (value: string | null): number | null => (value ? Date.parse(value) : null);

/**
 * One API row as the page holds it. The progress columns are newer than `job`
 * (flushed every 5 s; `job` is rewritten only on a state change), so they win.
 */
export function mergeRow(row: DownloadApiRow): DownloadItem {
    const job = row.job ?? {};
    return {
        nodeId: row.node_id,
        job: {
            ...job,
            download_id: row.id,
            kind: job.kind ?? 'Unknown',
            name: job.name ?? '',
            state: (row.state as JobState) ?? job.state ?? 'Unknown',
            done_bytes: num(row.done_bytes) ?? 0,
            total_bytes: num(row.total_bytes),
            down_bps: num(row.down_bps) ?? 0,
            up_bps: num(row.up_bps) ?? 0,
            peers: row.peers ?? 0,
            attempt: row.attempt ?? 0,
            retry_reason: row.retry_reason ?? job.retry_reason ?? null,
            next_attempt_at: ms(row.next_attempt_at) ?? job.next_attempt_at ?? null,
            finished_at: ms(row.finished_at) ?? job.finished_at ?? null,
            deleting: row.wanted === 'deleted' || undefined,
        },
    };
}

/**
 * A live `DownloadProgress` applied to the list: the frame carries the whole
 * job, so it replaces the row (or adds it). `Deleted` removes it.
 */
export function applyProgress(items: readonly DownloadItem[], nodeId: string, job: JobView): DownloadItem[] {
    const rest = items.filter((item) => item.job.download_id !== job.download_id);
    if (job.state === 'Deleted') return rest;
    const at = items.findIndex((item) => item.job.download_id === job.download_id);
    // Deleting until the node says Deleted: its progress in between does not carry it.
    const deleting = job.deleting || (at !== -1 && items[at].job.deleting) || undefined;
    const next = { nodeId, job: { ...job, deleting } };
    if (at === -1) return [next, ...rest];
    return [...rest.slice(0, at), next, ...rest.slice(at)];
}

export interface Summary {
    running: number;
    waiting: number;
    finishedToday: number;
    retrying: number;
}

const startOfDay = (now: number) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

/** The line above the groups: "3 running · 1 waiting for a node · 5 finished today · 1 retrying". */
export function summarize(items: readonly DownloadItem[], online: (nodeId: string) => boolean, now: number): Summary {
    const today = startOfDay(now);
    const out: Summary = { running: 0, waiting: 0, finishedToday: 0, retrying: 0 };
    for (const { nodeId, job } of items) {
        if (isActive(job)) {
            if (!online(nodeId)) out.waiting++;
            else if (job.state === 'Retrying') out.retrying++;
            else out.running++;
        } else if ((job.state === 'Completed' || job.state === 'Seeding') && (job.finished_at ?? 0) >= today) {
            out.finishedToday++;
        }
    }
    return out;
}

export function summaryParts(summary: Summary): { count: number; label: string }[] {
    return [
        { count: summary.running, label: 'running' },
        { count: summary.waiting, label: summary.waiting === 1 ? 'waiting for a node' : 'waiting for nodes' },
        { count: summary.finishedToday, label: 'finished today' },
        { count: summary.retrying, label: 'retrying' },
    ].filter((part) => part.count > 0);
}

export interface NodeGroup {
    node: NodeView;
    items: DownloadItem[];
}

/**
 * Rows grouped by node, like monitors are grouped by kind. Nodes in name order;
 * inside a node, active rows first, then by name. A row whose node is not in
 * `nodes` (removed, or not visible any more) still shows, under its id.
 */
export function groupByNode(items: readonly DownloadItem[], nodes: readonly NodeView[]): NodeGroup[] {
    const known = new Map(nodes.map((node) => [node.id, node]));
    const groups = new Map<string, NodeGroup>();
    for (const item of items) {
        let group = groups.get(item.nodeId);
        if (!group) {
            const node = known.get(item.nodeId) ?? { id: item.nodeId, name: item.nodeId.slice(0, 8), online: false };
            group = { node, items: [] };
            groups.set(item.nodeId, group);
        }
        group.items.push(item);
    }
    const rank = (item: DownloadItem) => (isActive(item.job) ? 0 : 1);
    for (const group of groups.values()) {
        group.items.sort((a, b) => rank(a) - rank(b) || a.job.name.localeCompare(b.job.name));
    }
    return [...groups.values()].sort((a, b) => a.node.name.localeCompare(b.node.name));
}

/** Decimal units, three significant figures: "356 MB", "1.12 GB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} B`;
    const units = ['kB', 'MB', 'GB', 'TB', 'PB'];
    let value = bytes;
    let unit = -1;
    do {
        value /= 1000;
        unit++;
    } while (value >= 1000 && unit < units.length - 1);
    return `${value >= 100 ? Math.round(value) : value.toPrecision(3)} ${units[unit]}`;
}

export function formatRate(bps: number): string {
    return `${formatBytes(bps)}/s`;
}

/** "48s", "12 min", "3 h", "2 days". */
/** " · starts in 3h 12m", or nothing when the node did not say. */
function opensIn(job: JobView, now: number): string {
    return job.next_attempt_at && job.next_attempt_at > now ? ` · starts in ${formatSpan(job.next_attempt_at - now)}` : '';
}

export function formatSpan(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h`;
    return `${Math.round(h / 24)} days`;
}

function percent(job: JobView): number | null {
    const total = job.total_bytes ?? 0;
    return total > 0 ? Math.min(100, (job.done_bytes / total) * 100) : null;
}

const pct = (value: number) => `${value.toFixed(1)}%`;

/**
 * The two lines under a download's name. `primary` is what it is doing,
 * `secondary` how much there is, or what happens next.
 */
export function describeRow(job: JobView, node: NodeView, now: number): { primary: string; secondary: string | null } {
    const p = percent(job);
    const sizes = job.total_bytes
        ? `${formatBytes(job.done_bytes)} of ${formatBytes(job.total_bytes)}`
        : job.done_bytes > 0 ? formatBytes(job.done_bytes) : null;

    if (job.deleting) {
        return {
            primary: 'deleting…',
            secondary: node.online ? null : `finishes when ${node.name} reconnects`,
        };
    }
    if (isActive(job) && !node.online) {
        return {
            primary: p === null ? 'waiting for the node' : `waiting for the node · ${Math.floor(p)}%`,
            secondary: `continues when ${node.name} reconnects`,
        };
    }

    switch (job.state) {
        case 'Downloading': {
            const parts = [p === null ? formatBytes(job.done_bytes) : pct(p)];
            if (job.kind === 'Torrent') {
                parts.push(`${job.peers} ${job.peers === 1 ? 'peer' : 'peers'}`);
            } else if (job.total_bytes && job.down_bps > 0) {
                parts.push(`${formatSpan(((job.total_bytes - job.done_bytes) / job.down_bps) * 1000)} left`);
            }
            return { primary: parts.join(' · '), secondary: sizes };
        }
        case 'Retrying': {
            const when = job.next_attempt_at ? `retrying in ${formatSpan(job.next_attempt_at - now)}` : 'retrying';
            const why = job.retry_reason ? ` · ${job.retry_reason}` : '';
            const attempt = job.attempt > 0 ? ` (attempt ${job.attempt})` : '';
            return { primary: `${when}${why}${attempt}`, secondary: sizes };
        }
        case 'Paused':
            return {
                primary: job.pause_reason === 'DiskFull' ? 'paused · the disk is nearly full'
                    : job.pause_reason === 'Window' ? `paused until its download window${opensIn(job, now)}` : 'paused',
                // R2: the node says what is free, the floor, and when it goes on.
                secondary: job.pause_reason === 'DiskFull' && job.reason ? job.reason : sizes,
            };
        case 'Queued':
            return { primary: 'queued', secondary: sizes };
        case 'Scheduled':
            // R2: the node sets next_attempt_at to when the window opens.
            return { primary: `waits for its download window${opensIn(job, now)}`, secondary: sizes };
        case 'Resolving':
            return { primary: 'starting', secondary: null };
        case 'FetchingMetadata':
            return { primary: `finding peers · ${job.peers} so far`, secondary: null };
        case 'Verifying':
            return { primary: 'checking the file', secondary: sizes };
        case 'Seeding':
            return { primary: `finished · seeding ↑ ${formatRate(job.up_bps)}`, secondary: sizes };
        case 'Completed':
            return { primary: 'finished', secondary: job.total_bytes ? formatBytes(job.total_bytes) : sizes };
        case 'Stopped':
            return { primary: p === null ? 'stopped' : `stopped · ${Math.floor(p)}%`, secondary: job.reason ?? sizes };
        case 'Cancelled':
            return { primary: 'cancelled', secondary: job.reason ?? null };
        default:
            return { primary: job.state.toLowerCase(), secondary: sizes };
    }
}

/** The line beside a node's name: "2 running · ↓ 15.7 MB/s", or when it was last seen. */
export function describeNode(group: NodeGroup, now: number): string {
    if (!group.node.online) {
        return group.node.lastSeen ? `last seen ${formatSpan(now - group.node.lastSeen)} ago` : 'offline';
    }
    const active = group.items.filter((item) => isActive(item.job));
    if (active.length === 0) return 'nothing running';
    const down = active.reduce((sum, item) => sum + item.job.down_bps, 0);
    const running = `${active.length} running`;
    return down > 0 ? `${running} · ↓ ${formatRate(down)}` : running;
}

/** Which buttons a row offers. Commands go to the server as frames. */
export function rowActions(job: JobView): { tryNow: boolean; stop: boolean; resume: boolean; remove: boolean } {
    return {
        tryNow: job.state === 'Retrying' || (job.state === 'Paused' && job.pause_reason === 'Window') || job.state === 'Scheduled',
        stop: isActive(job) || job.state === 'Seeding',
        resume: job.state === 'Stopped',
        remove: !isActive(job),
    };
}
