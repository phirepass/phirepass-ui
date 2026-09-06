import { json_response } from '@/app/lib/framework';
import { authzErrorStatus, nodeManageScope, requireSession, scopeAt } from '@/app/lib/authz';
import { getRedisClient } from '@/app/lib/redis';
import { query } from '@/app/lib/db';

type NodeSettings = Record<string, unknown>;

type ServiceDetail = {
    id: string;
    name: string | null;
    kind: string;
    host: string;
    port: number;
    username: string | null;
    password: string | null;
    scheme: 'http' | 'https' | null;
};

function normalizeSettings(value: unknown): NodeSettings {
    if (!value) {
        return {};
    }

    if (typeof value === 'string') {
        try {
            return normalizeSettings(JSON.parse(value));
        } catch {
            return {};
        }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as NodeSettings;
    }

    return {};
}

function normalizeServiceKind(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function toServiceDetail(entry: unknown): ServiceDetail | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const raw = entry as Record<string, unknown>;
    const kind = normalizeServiceKind(raw.kind);
    if (!kind) {
        return null;
    }

    const id = typeof raw.id === 'string' ? raw.id : null;
    if (!id) {
        return null;
    }

    return {
        id,
        name: typeof raw.name === 'string' ? raw.name : null,
        kind,
        host: typeof raw.host === 'string' ? raw.host : '',
        port: typeof raw.port === 'number' ? raw.port : 0,
        username: typeof raw.username === 'string' ? raw.username : null,
        password: typeof raw.password === 'string' ? raw.password : null,
        scheme: raw.scheme === 'https' ? 'https' : raw.scheme === 'http' ? 'http' : null,
    };
}

function extractServices(value: unknown): ServiceDetail[] {
    const entries = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.values(value as Record<string, unknown>)
            : [];

    return entries
        .map(toServiceDetail)
        .filter((service): service is ServiceDetail => service !== null);
}

// The agent's live heartbeat payload carries its currently configured services,
// including the ids actually registered with the connected agent. This is the
// source of truth whenever the node is online — Postgres can lag behind (e.g.
// stale ids from a previous run) and a stale id makes OpenTunnel a silent no-op
// since the agent won't recognize it.
// `ownerId`, not "the caller": the Redis key is namespaced under whoever
// enrolled the node, which after organisations is not necessarily the person
// asking.
async function fetchLiveServices(ownerId: string, nodeId: string): Promise<unknown> {
    const redis = await getRedisClient();
    if (!redis) {
        return null;
    }

    try {
        const key = `phirepass:users:${ownerId}:nodes:${nodeId}`;
        const fields = await redis.hGetAll(key);
        if (!fields || Object.keys(fields).length === 0) {
            return null;
        }

        // The server stores the node record (not the heartbeat stats) under the
        // "node" hash field; that's where `settings.services` actually lives.
        const node = JSON.parse(fields.node) as { settings?: { services?: unknown } };
        return node?.settings?.services ?? null;
    } catch {
        return null;
    }
}

// Returns the full configuration (including credentials) for a node's services,
// so the edit dialog can be pre-filled. Kept out of the polled /api/nodes list
// response since that's fetched repeatedly and doesn't need credentials in it.
export async function GET(req: Request) {
    try {
        const session = await requireSession();
        const url = new URL(req.url);
        const nodeId = url.searchParams.get('id');
        const requestedKind = normalizeServiceKind(url.searchParams.get('kind'));

        if (!nodeId) {
            return json_response({ error: 'Node id is required' }, 400);
        }

        // The **manage** scope, not the read scope, and this is the route that
        // makes the difference matter: the answer contains service passwords in
        // the clear (`phirepass-rs/PLAN.md` P01 — they are stored unencrypted in
        // `nodes.settings`). Reaching a node and being handed the credentials
        // for what runs on it are different rights, which is exactly the
        // distinction `SHARING.md` draws between using a node and configuring
        // it. Until P01 lands, only somebody who could already change the node
        // gets to read them back.
        const scope = scopeAt(nodeManageScope(session, 'n'), 1);

        const result = await query(
            `SELECT n.settings, n.user_id FROM nodes n WHERE n.id = $1 AND ${scope.sql}`,
            [nodeId, ...scope.params]
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }

        const ownerId = (result.rows[0] as { user_id: string }).user_id;
        const liveServices = await fetchLiveServices(ownerId, nodeId);
        let services = extractServices(liveServices);

        if (services.length === 0) {
            const settings = normalizeSettings(result.rows[0].settings);
            services = extractServices(settings.services);
        }

        const filtered = services.filter((service) => !requestedKind || service.kind === requestedKind);

        return json_response({ services: filtered }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
