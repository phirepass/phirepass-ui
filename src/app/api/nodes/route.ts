import { json_response } from '@/app/lib/framework';
import { verifyToken } from '@/app/lib/auth';
import { getRedisClient } from '@/app/lib/redis';
import { query } from '@/app/lib/db';

type NodeStats = {
    ip: string;
    // host_connections: number; // unused by frontend
    host_cpu: number;
    host_ip: string;
    host_local_ip: string;
    host_load_average: [number, number, number];
    host_mac: string;
    host_mem_total_bytes: number;
    host_mem_used_bytes: number;
    host_name: string;
    host_os_info: string;
    host_processes: number;
    host_uptime_secs: number;
    // last_refreshed_secs: number; // unused by frontend
    // proc_cpu: number; // unused by frontend
    // proc_id: string; // unused by frontend
    // proc_mem_bytes: number; // unused by frontend
    // proc_threads: number; // unused by frontend
    // proc_uptime_secs: number; // unused by frontend
    version: string;
};

// The agent reports itself in two halves, split by lifetime (see
// phirepass-rs/CLAUDE.md, "Node telemetry"): `info` is gathered once and sent
// with the auth frame, `stats` is resampled and sent with every heartbeat. In
// Redis they are two fields of the node hash — `info` written once at connect,
// `stats` rewritten per heartbeat — and the heartbeat blob also nests a copy of
// `info`. The frontend still consumes one flat `stats` object, so this route
// merges them back together, preferring `info` for the static fields and falling
// back to the stats payload for hashes written before the split.
type NodePublicIpInfo = {
    ip?: string;
    hostname?: string;
    continent?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
    time_zone?: string;
    asn?: string;
    asn_org?: string;
    is_proxy?: boolean;
};

type NodeInfoPayload = {
    proc_id?: string;
    version?: string;
    host_name?: string;
    host_ip?: string;
    host_local_ip?: string;
    host_mac?: string;
    host_os_info?: string;
    public?: NodePublicIpInfo | null;
    created_at?: number;
};

type NodeStatsPayload = {
    id?: string;
    name?: string;
    server_id?: string;
    ip?: string;
    connected_for_secs?: number;
    // since_last_heartbeat_secs?: number; // unused by frontend
    services?: unknown;
    stats?: Partial<NodeStats>;
    info?: NodeInfoPayload | null;
} & Partial<NodeStats>;

type UserNodeRow = {
    id: string;
    name: string | null;
    created_at: string;
    settings: unknown;
};

type NodeSettings = Record<string, unknown>;

function toNumber(value: unknown, fallback: number = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toString(value: unknown, fallback: string = '') {
    return typeof value === 'string' ? value : fallback;
}

function normalizeLoadAverage(value: unknown): [number, number, number] {
    if (Array.isArray(value) && value.length >= 3) {
        return [toNumber(value[0]), toNumber(value[1]), toNumber(value[2])];
    }
    return [0, 0, 0];
}

type ServiceSummary = number | { visibility: 'public' | 'private'; count: number };

function normalizeServices(value: unknown): Record<string, ServiceSummary> {
    const counts: Record<string, number> = {};
    const httpVisibility: Record<string, 'public' | 'private'> = {};

    const addKind = (entry: unknown) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }

        const kind = (entry as { kind?: unknown }).kind;
        if (typeof kind !== 'string') {
            return;
        }

        const service = kind.trim();
        if (!service) {
            return;
        }

        counts[service] = (counts[service] ?? 0) + 1;

        if (service.toUpperCase() === 'HTTP') {
            const visibility = (entry as { visibility?: unknown }).visibility;
            if (visibility === 'public') {
                httpVisibility[service] = 'public';
            } else if (!httpVisibility[service]) {
                httpVisibility[service] = 'private';
            }
        }
    };

    if (Array.isArray(value)) {
        value.forEach(addKind);
    } else if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(addKind);
    }

    const result: Record<string, ServiceSummary> = {};
    for (const [service, count] of Object.entries(counts)) {
        result[service] = service in httpVisibility
            ? { visibility: httpVisibility[service], count }
            : count;
    }

    return result;
}

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

function buildDefaultStats(overrides?: Partial<NodeStats>): NodeStats {
    return {
        ip: '',
        // host_connections: 0, // unused by frontend
        host_cpu: 0,
        host_ip: '',
        host_local_ip: '',
        host_load_average: [0, 0, 0],
        host_mac: '',
        host_mem_total_bytes: 0,
        host_mem_used_bytes: 0,
        host_name: '',
        host_os_info: '',
        host_processes: 0,
        host_uptime_secs: 0,
        // last_refreshed_secs: 0, // unused by frontend
        // proc_cpu: 0, // unused by frontend
        // proc_id: '', // unused by frontend
        // proc_mem_bytes: 0, // unused by frontend
        // proc_threads: 0, // unused by frontend
        // proc_uptime_secs: 0, // unused by frontend
        version: '',
        ...overrides,
    };
}

function normalizePublicIpInfo(value: unknown): NodePublicIpInfo | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as NodePublicIpInfo;
    const ip = toString(raw.ip);
    if (!ip) {
        return null;
    }

    return {
        ip,
        hostname: toString(raw.hostname) || undefined,
        continent: toString(raw.continent) || undefined,
        country: toString(raw.country) || undefined,
        country_code: toString(raw.country_code) || undefined,
        region: toString(raw.region) || undefined,
        city: toString(raw.city) || undefined,
        postal_code: toString(raw.postal_code) || undefined,
        latitude: typeof raw.latitude === 'number' ? raw.latitude : undefined,
        longitude: typeof raw.longitude === 'number' ? raw.longitude : undefined,
        time_zone: toString(raw.time_zone) || undefined,
        asn: toString(raw.asn) || undefined,
        asn_org: toString(raw.asn_org) || undefined,
        is_proxy: typeof raw.is_proxy === 'boolean' ? raw.is_proxy : undefined,
    };
}

function normalizeInfoPayload(value: unknown): NodeInfoPayload | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as NodeInfoPayload;

    return {
        proc_id: toString(raw.proc_id) || undefined,
        version: toString(raw.version) || undefined,
        host_name: toString(raw.host_name) || undefined,
        host_ip: toString(raw.host_ip) || undefined,
        host_local_ip: toString(raw.host_local_ip) || undefined,
        host_mac: toString(raw.host_mac) || undefined,
        host_os_info: toString(raw.host_os_info) || undefined,
        public: normalizePublicIpInfo(raw.public),
        created_at: typeof raw.created_at === 'number' ? raw.created_at : undefined,
    };
}

function normalizeStatsPayload(
    payload: NodeStatsPayload | undefined,
    fallbackName: string,
    infoField?: NodeInfoPayload | null,
): NodeStatsPayload | null {
    if (!payload && !infoField) {
        return null;
    }

    const statsSource = payload?.stats ? payload.stats : (payload ?? {});
    // The `info` written at connect and the copy nested in the heartbeat blob are
    // the same value; either will do, and preferring the standalone field means a
    // node that has connected but not yet heartbeated still has an identity.
    const info = infoField ?? normalizeInfoPayload(payload?.info) ?? null;

    // Static fields moved out of `stats` and into `info`. Reading info first and
    // falling back to the old location keeps pre-split payloads rendering — they
    // survive in Redis for the key's 120s TTL across a server rollout.
    const staticField = (key: keyof NodeInfoPayload & keyof NodeStats) => {
        const fromInfo = info ? info[key] : undefined;
        return toString(fromInfo) || toString(statsSource[key]);
    };

    return {
        id: payload?.id,
        name: payload?.name,
        server_id: payload?.server_id,
        ip: payload?.ip,
        connected_for_secs: toNumber(payload?.connected_for_secs),
        // since_last_heartbeat_secs: toNumber(payload.since_last_heartbeat_secs), // unused by frontend
        info,
        stats: buildDefaultStats({
            ip: toString(statsSource.ip ?? payload?.ip) || staticField('host_ip'),
            // host_connections: toNumber(statsSource.host_connections), // unused by frontend
            host_cpu: toNumber(statsSource.host_cpu),
            host_ip: staticField('host_ip'),
            host_local_ip: staticField('host_local_ip'),
            host_load_average: normalizeLoadAverage(statsSource.host_load_average),
            host_mac: staticField('host_mac'),
            host_mem_total_bytes: toNumber(statsSource.host_mem_total_bytes),
            host_mem_used_bytes: toNumber(statsSource.host_mem_used_bytes),
            host_name: staticField('host_name') || fallbackName,
            host_os_info: staticField('host_os_info'),
            host_processes: toNumber(statsSource.host_processes),
            host_uptime_secs: toNumber(statsSource.host_uptime_secs),
            // last_refreshed_secs: toNumber(statsSource.last_refreshed_secs), // unused by frontend
            // proc_cpu: toNumber(statsSource.proc_cpu), // unused by frontend
            // proc_id: toString(statsSource.proc_id), // unused by frontend
            // proc_mem_bytes: toNumber(statsSource.proc_mem_bytes), // unused by frontend
            // proc_threads: toNumber(statsSource.proc_threads), // unused by frontend
            // proc_uptime_secs: toNumber(statsSource.proc_uptime_secs), // unused by frontend
            version: staticField('version'),
        }),
    };
}

async function getUserNodeStats(redis: Awaited<ReturnType<typeof getRedisClient>>, userId: string) {
    if (!redis){
        return new Map();
    }

    const statsKeyPattern = `phirepass:users:${userId}:nodes:*`;
    const keys: string[] = [];

    for await (const batch of redis.scanIterator({ MATCH: statsKeyPattern })) {
        keys.push(...(batch as string[]));
    }

    const entries = new Map<string, { stats?: NodeStatsPayload; info: NodeInfoPayload | null }>();
    if (keys.length === 0) {
        return entries;
    }

    // Pipeline all hash reads into a single round trip instead of awaiting them one by one.
    let pipeline: ReturnType<typeof redis.multi> = redis.multi();
    for (const key of keys) {
        pipeline = pipeline.hGetAll(key) as unknown as typeof pipeline;
    }
    const results = await pipeline.exec() as unknown as Record<string, string>[];

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const node = results[i];
        if (!node) continue;
        if (Object.keys(node).length === 0) continue;

        // The two fields are parsed independently: `stats` is empty between the
        // agent's auth and its first heartbeat, and losing `info` to that empty
        // string would drop the node's identity for a whole heartbeat interval.
        const parsedStats = parseHashField<NodeStatsPayload>(node.stats, key, 'stats');
        const parsedInfo = normalizeInfoPayload(parseHashField(node.info, key, 'info'));

        if (!parsedStats && !parsedInfo) {
            continue;
        }

        const derivedId = typeof parsedStats?.id === 'string'
            ? parsedStats.id
            : key.split(':').pop();

        if (derivedId) {
            entries.set(derivedId, {
                stats: parsedStats ?? undefined,
                info: parsedInfo,
            });
        }
    }

    return entries;
}

function parseHashField<T>(value: string | undefined, key: string, field: string): T | null {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch (e) {
        console.warn(`[getUserNodeStats] Failed to parse ${field} for key ${key}:`, e);
        return null;
    }
}

export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const redis = await getRedisClient();
        const url = new URL(req.url);
        const requestedId = url.searchParams.get('id');

        const result = await query(
            `SELECT id, name, created_at, settings
            FROM nodes
            WHERE user_id = $1
            ORDER BY created_at DESC`,
            [user.id]
        );

        const nodesFromDb = result.rows as UserNodeRow[];
        const statsById = await getUserNodeStats(redis, user.id);

        const mergedNodes = nodesFromDb.map((node) => {
            const rawPayload = statsById.get(node.id);
            const statsPayload = rawPayload?.stats;
            const payload = normalizeStatsPayload(statsPayload, node.name ?? '', rawPayload?.info);
            const stats = payload?.stats ?? buildDefaultStats({ host_name: node.name ?? '' });
            const ip = payload?.ip
                ?? payload?.stats?.ip
                ?? payload?.stats?.host_ip
                ?? '';
            // Still keyed off the heartbeat payload, not `info`: `info` only proves
            // the agent authenticated at some point inside the key's TTL, whereas
            // stats prove it was alive as of its last heartbeat.
            const isOnline = !!statsPayload;
            const settings = normalizeSettings(node.settings);
            const services = normalizeServices(settings.services ?? payload?.services);

            return {
                id: node.id,
                name: node.name ?? payload?.name ?? '',
                ip,
                server_id: payload?.server_id ?? node.id,
                connected_for_secs: payload?.connected_for_secs ?? 0,
                // since_last_heartbeat_secs: payload?.since_last_heartbeat_secs ?? 0, // unused by frontend
                is_online: isOnline,
                stats,
                info: payload?.info ?? null,
                services,
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

        const duplicateNameResult = await query(
            `SELECT 1
             FROM nodes
             WHERE user_id = $1
               AND id <> $2
               AND LOWER(TRIM(name)) = LOWER($3)
             LIMIT 1`,
            [user.id, id, name]
        );

        if ((duplicateNameResult.rowCount ?? 0) > 0) {
            return json_response({ error: 'You already have a node with that name' }, 409);
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

export async function DELETE(req: Request) {
    try {
        const user = await verifyToken();
        const redis = await getRedisClient();
        const url = new URL(req.url);
        const requestId = url.searchParams.get('id');

        let bodyId = '';
        if (!requestId) {
            const payload = await req.json().catch(() => ({})) as { id?: unknown };
            bodyId = typeof payload.id === 'string' ? payload.id.trim() : '';
        }

        const id = (requestId ?? bodyId).trim();
        if (!id) {
            return json_response({ error: 'Node id is required' }, 400);
        }

        const result = await query(
            `DELETE FROM nodes
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, user.id]
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }

        if (redis) {
            const redisKey = `phirepass:users:${user.id}:nodes:${id}`;
            await redis.del(redisKey);
        }

        return json_response({ id }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
