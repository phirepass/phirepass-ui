import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyProgress,
    describeNode,
    describeRow,
    formatBytes,
    groupByNode,
    mergeRow,
    rowActions,
    summarize,
    summaryParts,
    type DownloadItem,
    type JobView,
    type NodeView,
} from './download-display.ts';

const NOW = Date.parse('2026-11-16T12:00:00Z');

const job = (over: Partial<JobView>): JobView => ({
    download_id: 'd1',
    kind: 'Http',
    name: 'file.bin',
    state: 'Downloading',
    done_bytes: 0,
    total_bytes: null,
    down_bps: 0,
    up_bps: 0,
    peers: 0,
    attempt: 0,
    ...over,
});

const pi: NodeView = { id: 'n-pi', name: 'raspberrypi', online: true };
const nas: NodeView = { id: 'n-nas', name: 'office-nas', online: false, lastSeen: NOW - 14 * 60_000 };
const ha: NodeView = { id: 'n-ha', name: 'home-assistant', online: true };

test('a download on an offline node waits and says so; it is not failed', () => {
    const row = describeRow(job({ done_bytes: 61, total_bytes: 100 }), nas, NOW);
    assert.equal(row.primary, 'waiting for the node · 61%');
    assert.equal(row.secondary, 'continues when office-nas reconnects');
});

test('a running link shows percent and time left, a torrent shows peers', () => {
    const link = describeRow(job({ done_bytes: 356e6, total_bytes: 920e6, down_bps: 11.75e6 }), pi, NOW);
    assert.equal(link.primary, '38.7% · 48s left');
    assert.equal(link.secondary, '356 MB of 920 MB');

    const torrent = describeRow(job({ kind: 'Torrent', done_bytes: 263e6, total_bytes: 1.124e9, peers: 28 }), pi, NOW);
    assert.equal(torrent.primary, '23.4% · 28 peers');
    assert.equal(torrent.secondary, '263 MB of 1.12 GB');
});

test('an error reads as retrying, with its reason and the attempt', () => {
    const row = describeRow(job({
        state: 'Retrying', retry_reason: '403 Forbidden', attempt: 6, next_attempt_at: NOW + 8 * 60_000,
    }), ha, NOW);
    assert.equal(row.primary, 'retrying in 8 min · 403 Forbidden (attempt 6)');
    assert.deepEqual(rowActions(job({ state: 'Retrying' })), { tryNow: true, stop: true, resume: false, remove: false });
});

test('absent optional fields read like null ones', () => {
    // The real channel sends a Rust None as a missing field.
    const row = describeRow({ download_id: 'x', kind: 'Http', name: 'a', state: 'Downloading', done_bytes: 5, down_bps: 0, up_bps: 0, peers: 0, attempt: 0 }, pi, NOW);
    assert.equal(row.primary, '5 B');
});

test('rows group by node, in name order, active rows first', () => {
    const items: DownloadItem[] = [
        { nodeId: 'n-pi', job: job({ download_id: 'a', name: 'zzz.iso', state: 'Completed' }) },
        { nodeId: 'n-nas', job: job({ download_id: 'b', name: 'dataset.tar' }) },
        { nodeId: 'n-pi', job: job({ download_id: 'c', name: 'movie.mkv' }) },
        { nodeId: 'n-gone', job: job({ download_id: 'd', name: 'orphan' }) },
    ];
    const groups = groupByNode(items, [pi, nas, ha]);
    assert.deepEqual(groups.map((g) => g.node.name), ['n-gone'.slice(0, 8), 'office-nas', 'raspberrypi']);
    assert.deepEqual(groups[2].items.map((i) => i.job.name), ['movie.mkv', 'zzz.iso']);
    assert.ok(!groups.some((g) => g.node.id === 'n-ha'), 'a node with no downloads gets no group');
});

test('the summary counts running, waiting, finished today and retrying', () => {
    const online = (id: string) => id !== 'n-nas';
    const items: DownloadItem[] = [
        { nodeId: 'n-pi', job: job({ download_id: '1' }) },
        { nodeId: 'n-pi', job: job({ download_id: '2', state: 'Queued' }) },
        { nodeId: 'n-nas', job: job({ download_id: '3' }) },
        { nodeId: 'n-ha', job: job({ download_id: '4', state: 'Retrying' }) },
        { nodeId: 'n-pi', job: job({ download_id: '5', state: 'Completed', finished_at: NOW - 60_000 }) },
        { nodeId: 'n-pi', job: job({ download_id: '6', state: 'Seeding', finished_at: NOW - 3 * 86_400_000 }) },
    ];
    const summary = summarize(items, online, NOW);
    assert.deepEqual(summary, { running: 2, waiting: 1, finishedToday: 1, retrying: 1 });
    assert.deepEqual(summaryParts(summary).map((p) => p.label), ['running', 'waiting for a node', 'finished today', 'retrying']);
});

test('a live progress frame replaces the row in place, adds a new one, and Deleted removes it', () => {
    const items: DownloadItem[] = [
        { nodeId: 'n-pi', job: job({ download_id: 'a', done_bytes: 1 }) },
        { nodeId: 'n-pi', job: job({ download_id: 'b' }) },
    ];
    const updated = applyProgress(items, 'n-pi', job({ download_id: 'b', done_bytes: 9 }));
    assert.deepEqual(updated.map((i) => [i.job.download_id, i.job.done_bytes]), [['a', 1], ['b', 9]]);

    const added = applyProgress(updated, 'n-ha', job({ download_id: 'c' }));
    assert.equal(added[0].job.download_id, 'c');

    const removed = applyProgress(added, 'n-pi', job({ download_id: 'a', state: 'Deleted' }));
    assert.deepEqual(removed.map((i) => i.job.download_id), ['c', 'b']);
});

test('an API row takes its progress from the columns, which are newer than the job', () => {
    const item = mergeRow({
        id: 'd9', node_id: 'n-pi', state: 'Downloading',
        job: { name: 'x.iso', kind: 'Http', done_bytes: 10, state: 'Queued' },
        done_bytes: '5000000000', total_bytes: '8000000000', down_bps: '100', up_bps: '0', peers: 0,
        attempt: 0, retry_reason: null, next_attempt_at: null, finished_at: null,
    });
    assert.equal(item.job.done_bytes, 5e9, 'bigints arrive as strings and stay exact past 4 GB');
    assert.equal(item.job.state, 'Downloading');
    assert.equal(item.job.download_id, 'd9');
});

test('the node line says how many run and how fast, or when it was last seen', () => {
    const items: DownloadItem[] = [
        { nodeId: 'n-pi', job: job({ download_id: '1', down_bps: 10e6 }) },
        { nodeId: 'n-pi', job: job({ download_id: '2', down_bps: 5.7e6 }) },
    ];
    assert.equal(describeNode({ node: pi, items }, NOW), '2 running · ↓ 15.7 MB/s');
    assert.equal(describeNode({ node: nas, items }, NOW), 'last seen 14 min ago');
    assert.equal(formatBytes(999), '999 B');
});

test('a download paused for disk shows what the node said about the floor (R2)', () => {
    const said = '1.6 GB free on /srv/downloads, the floor is 2 GB. Resumes by itself at 3.07 GB free.';
    const row = describeRow(job({ state: 'Paused', pause_reason: 'DiskFull', reason: said }), pi, NOW);
    assert.deepEqual([row.primary, row.secondary], ['paused · the disk is nearly full', said]);
});

test('a scheduled or window-paused download says when its window opens (R2)', () => {
    const opens = NOW + (3 * 60 + 12) * 60_000;
    assert.equal(describeRow(job({ state: 'Scheduled', next_attempt_at: opens }), pi, NOW).primary,
        'waits for its download window · starts in 3 h');
    assert.equal(describeRow(job({ state: 'Paused', pause_reason: 'Window', next_attempt_at: opens }), pi, NOW).primary,
        'paused until its download window · starts in 3 h');
    assert.equal(describeRow(job({ state: 'Scheduled' }), pi, NOW).primary, 'waits for its download window');
});

test('a row waiting to be deleted says so until the node says Deleted', () => {
    const fromList = mergeRow({
        id: 'd1', node_id: 'n-nas', wanted: 'deleted', state: 'Stopped',
        job: { name: 'x.iso', kind: 'Http', state: 'Stopped' },
        done_bytes: '0', total_bytes: null, down_bps: '0', up_bps: '0', peers: 0,
        attempt: 0, retry_reason: null, next_attempt_at: null, finished_at: null,
    });
    assert.deepEqual(describeRow(fromList.job, nas, NOW), {
        primary: 'deleting…',
        secondary: 'finishes when office-nas reconnects',
    });

    // Told live, then the node's own progress before it applies the Delete.
    let items = applyProgress([], 'n-pi', job({ state: 'Stopped', deleting: true }));
    items = applyProgress(items, 'n-pi', job({ state: 'Stopped' }));
    assert.equal(describeRow(items[0].job, pi, NOW).primary, 'deleting…');
    assert.deepEqual(applyProgress(items, 'n-pi', job({ state: 'Deleted' })), []);
});
