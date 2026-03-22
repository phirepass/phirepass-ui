import { json_response } from '@/app/lib/framework';
import { verifyToken } from '@/app/lib/auth';
import { getRedisClient } from '@/app/lib/redis';
import { query } from '@/app/lib/db';

type NodeStats = {
    host_connections: number;
    host_cpu: number;
    host_ip: string;
    host_load_average: [number, number, number];
    host_mac: string;
    host_mem_total_bytes: number;
    host_mem_used_bytes: number;
    host_name: string;
    host_os_info: string;
    host_processes: number;
    host_uptime_secs: number;
    last_refreshed_secs: number;
    proc_cpu: number;
    proc_id: string;
    proc_mem_bytes: number;
    proc_threads: number;
    proc_uptime_secs: number;
};

type NodeStatsPayload = {
    id?: string;
    name?: string;
    serde_id?: string;
    ip?: string;
    connected_for_secs?: number;
    since_last_heartbeat_secs?: number;
    stats?: Partial<NodeStats>;
} & Partial<NodeStats>;

type UserNodeRow = {
    id: string;
    name: string | null;
    created_at: string;
};

function toNumber(value: unknown, fallback: number = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeLoadAverage(value: unknown): [number, number, number] {
    if (Array.isArray(value) && value.length >= 3) {
        return [toNumber(value[0]), toNumber(value[1]), toNumber(value[2])];
    }
    return [0, 0, 0];
}

function buildDefaultStats(overrides?: Partial<NodeStats>): NodeStats {
    return {
        host_connections: 0,
        host_cpu: 0,
        host_ip: '',
        host_load_average: [0, 0, 0],
        host_mac: '',
        host_mem_total_bytes: 0,
        host_mem_used_bytes: 0,
        host_name: '',
        host_os_info: '',
        host_processes: 0,
        host_uptime_secs: 0,
        last_refreshed_secs: 0,
        proc_cpu: 0,
        proc_id: '',
        proc_mem_bytes: 0,
        proc_threads: 0,
        proc_uptime_secs: 0,
        ...overrides,
    };
}

function normalizeStatsPayload(payload: NodeStatsPayload | undefined, fallbackName: string): NodeStatsPayload | null {
    if (!payload) return null;

    const statsSource = payload.stats ? payload.stats : payload;

    return {
        id: payload.id,
        name: payload.name,
        serde_id: payload.serde_id,
        ip: payload.ip,
        connected_for_secs: toNumber(payload.connected_for_secs),
        since_last_heartbeat_secs: toNumber(payload.since_last_heartbeat_secs),
        stats: buildDefaultStats({
            host_connections: toNumber(statsSource.host_connections),
            host_cpu: toNumber(statsSource.host_cpu),
            host_ip: typeof statsSource.host_ip === 'string' ? statsSource.host_ip : '',
            host_load_average: normalizeLoadAverage(statsSource.host_load_average),
            host_mac: typeof statsSource.host_mac === 'string' ? statsSource.host_mac : '',
            host_mem_total_bytes: toNumber(statsSource.host_mem_total_bytes),
            host_mem_used_bytes: toNumber(statsSource.host_mem_used_bytes),
            host_name: typeof statsSource.host_name === 'string' && statsSource.host_name
                ? statsSource.host_name
                : fallbackName,
            host_os_info: typeof statsSource.host_os_info === 'string' ? statsSource.host_os_info : '',
            host_processes: toNumber(statsSource.host_processes),
            host_uptime_secs: toNumber(statsSource.host_uptime_secs),
            last_refreshed_secs: toNumber(statsSource.last_refreshed_secs),
            proc_cpu: toNumber(statsSource.proc_cpu),
            proc_id: typeof statsSource.proc_id === 'string' ? statsSource.proc_id : '',
            proc_mem_bytes: toNumber(statsSource.proc_mem_bytes),
            proc_threads: toNumber(statsSource.proc_threads),
            proc_uptime_secs: toNumber(statsSource.proc_uptime_secs),
        }),
    };
}

async function getUserNodeStats(redis: Awaited<ReturnType<typeof getRedisClient>>, userId: string) {
    if (!redis) return new Map<string, NodeStatsPayload>();

    const statsKeyPattern = `phirepass:users:${userId}:nodes:*`;
    const keys: string[] = [];

    for await (const key of redis.scanIterator({ MATCH: statsKeyPattern, COUNT: 100 })) {
        keys.push(key as string);
    }

    const entries = new Map<string, NodeStatsPayload>();

    for (const key of keys) {
        const stats = await redis.hGet(key, "stats");
        if (!stats) continue;

        const parsed = JSON.parse(stats) as NodeStatsPayload;
        const derivedId = typeof parsed?.id === 'string'
            ? parsed.id
            : key.split(':').pop();

        if (derivedId) {
            entries.set(derivedId, parsed);
        }
    }

    return entries;
}

export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const redis = await getRedisClient();
        const url = new URL(req.url);
        const requestedId = url.searchParams.get('id');

        const result = await query(
            `SELECT id, name, created_at
            FROM nodes
            WHERE user_id = $1
            ORDER BY created_at DESC`,
            [user.id]
        );

        const nodesFromDb = result.rows as UserNodeRow[];
        const statsById = await getUserNodeStats(redis, user.id);

        const mergedNodes = nodesFromDb.map((node) => {
            const rawPayload = statsById.get(node.id);
            const payload = normalizeStatsPayload(rawPayload, node.name ?? '');
            const stats = payload?.stats ?? buildDefaultStats({ host_name: node.name ?? '' });
            const ip = payload?.ip
                ?? payload?.stats?.host_ip
                ?? '';
            const isOnline = !!rawPayload;

            return {
                id: node.id,
                name: node.name ?? payload?.name ?? '',
                ip,
                serde_id: payload?.serde_id ?? node.id,
                connected_for_secs: payload?.connected_for_secs ?? 0,
                since_last_heartbeat_secs: payload?.since_last_heartbeat_secs ?? 0,
                is_online: isOnline,
                stats,
            };
        });

        const filteredNodes = requestedId
            ? mergedNodes.filter((node) => node.id === requestedId)
            : mergedNodes;

        return json_response(filteredNodes, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

export async function PATCH(req: Request) {
    try {
        const user = await verifyToken();
        const payload = await req.json() as { id?: unknown; name?: unknown };

        const id = typeof payload.id === 'string' ? payload.id.trim() : '';
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';

        if (!id) {
            return json_response({ error: 'Node id is required' }, 400);
        }

        if (!name) {
            return json_response({ error: 'Node name is required' }, 400);
        }

        if (name.length > 120) {
            return json_response({ error: 'Node name must be 120 characters or less' }, 400);
        }

        const result = await query(
            `UPDATE nodes
             SET name = $1
             WHERE id = $2 AND user_id = $3
             RETURNING id, name`,
            [name, id, user.id]
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }

        return json_response(result.rows[0], 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
