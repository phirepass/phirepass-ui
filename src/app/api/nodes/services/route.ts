import { json_response } from '@/app/lib/framework';
import { verifyToken } from '@/app/lib/auth';
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
async function fetchLiveServices(userId: string, nodeId: string): Promise<unknown> {
    const redis = await getRedisClient();
    if (!redis) {
        return null;
    }

    try {
        const key = `phirepass:users:${userId}:nodes:${nodeId}`;
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
        const user = await verifyToken();
        const url = new URL(req.url);
        const nodeId = url.searchParams.get('id');
        const requestedKind = normalizeServiceKind(url.searchParams.get('kind'));

        if (!nodeId) {
            return json_response({ error: 'Node id is required' }, 400);
        }

        const result = await query(
            `SELECT settings FROM nodes WHERE id = $1 AND user_id = $2`,
            [nodeId, user.id]
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }

        const liveServices = await fetchLiveServices(user.id, nodeId);
        let services = extractServices(liveServices);

        if (services.length === 0) {
            const settings = normalizeSettings(result.rows[0].settings);
            services = extractServices(settings.services);
        }

        const filtered = services.filter((service) => !requestedKind || service.kind === requestedKind);

        return json_response({ services: filtered }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
