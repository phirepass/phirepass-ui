import { DEMO_NODE_IDS, DEMO_NODE_SPECS, DEMO_USER } from './fixtures';

/**
 * Sample rows for the Downloads page (screen U1), in the shape of
 * `GET /api/downloads`. Times are relative to `now` so the page reads the same
 * whenever the demo is shown. One row sits on an offline node to show that a
 * download there waits rather than fails, and one retries with its reason.
 */
export function demoDownloads(now: number) {
    const MIN = 60_000;
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const row = (
        id: string,
        nodeId: string,
        kind: 'Http' | 'Torrent',
        name: string,
        state: string,
        fields: Partial<{
            done: number; total: number | null; down: number; up: number; peers: number;
            attempt: number; retry_reason: string; next_attempt_at: string; finished_at: string;
        }>,
    ) => ({
        id,
        node_id: nodeId,
        wanted: 'running',
        state,
        job: { download_id: id, kind, name, state },
        done_bytes: fields.done ?? 0,
        total_bytes: fields.total ?? null,
        down_bps: fields.down ?? 0,
        up_bps: fields.up ?? 0,
        peers: fields.peers ?? 0,
        attempt: fields.attempt ?? 0,
        retry_reason: fields.retry_reason ?? null,
        next_attempt_at: fields.next_attempt_at ?? null,
        updated_at: iso(0),
        finished_at: fields.finished_at ?? null,
    });

    return [
        row('7d3c1a10-0000-4000-8000-000000000001', DEMO_NODE_IDS.officeNas, 'Http', 'ubuntu-24.04.1-live-server-amd64.iso', 'Downloading',
            { done: 1.09e9, total: 2.77e9, down: 15.7e6 }),
        row('7d3c1a10-0000-4000-8000-000000000002', DEMO_NODE_IDS.officeNas, 'Torrent', 'Sintel.2010.1080p.mkv', 'Downloading',
            { done: 263e6, total: 1.124e9, down: 3.1e6, up: 0.4e6, peers: 28 }),
        row('7d3c1a10-0000-4000-8000-000000000003', DEMO_NODE_IDS.officeNas, 'Http', 'quarterly-report-assets.zip', 'Completed',
            { done: 412e6, total: 412e6, finished_at: iso(-95 * MIN) }),
        row('7d3c1a10-0000-4000-8000-000000000004', DEMO_NODE_IDS.backupOslo, 'Http', 'dataset-2026.tar.zst', 'Downloading',
            { done: 6.1e9, total: 10e9 }),
        row('7d3c1a10-0000-4000-8000-000000000005', DEMO_NODE_IDS.edgeFra, 'Http', 'nightly-build.zip', 'Retrying',
            { done: 0, attempt: 6, retry_reason: '403 Forbidden', next_attempt_at: iso(8 * MIN) }),
    ];
}

/** Organisation → Downloads (L1) for the demo fleet: one node set to links only. */
export function demoDownloadPolicies(now: number) {
    const running = new Map<string, number>();
    for (const row of demoDownloads(now)) {
        if (row.state !== 'Completed') running.set(row.node_id, (running.get(row.node_id) ?? 0) + 1);
    }
    return DEMO_NODE_SPECS.map((node) => {
        const limited = node.id === DEMO_NODE_IDS.posBerlin;
        return {
            id: node.id,
            name: node.name,
            owner_id: DEMO_USER.id,
            owner_username: DEMO_USER.username,
            owner_email: DEMO_USER.email,
            policy: limited ? 'links_only' : 'allowed',
            changed_at: limited ? new Date(now - 2 * 86_400_000).toISOString() : null,
            changed_by: limited ? DEMO_USER.id : null,
            changed_by_username: limited ? DEMO_USER.username : null,
            changed_by_email: limited ? DEMO_USER.email : null,
            downloads_on: node.services.some((service) => service.kind === 'FETCH'),
            running: running.get(node.id) ?? 0,
        };
    });
}
