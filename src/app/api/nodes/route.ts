import { json_response } from '@/app/lib/framework';
import { verifyToken } from '@/app/lib/auth';
import { getRedisClient } from '@/app/lib/redis';

async function getUserNodeStats(redis: Awaited<ReturnType<typeof getRedisClient>>, userId: string) {
    if (!redis) return [] as unknown[];

    const statsKeyPattern = `phirepass:users:${userId}:nodes:*:stats`;
    const keys: string[] = [];

    console.log(`[server][getUserNodeStats] scanning keys with pattern: ${statsKeyPattern}`);
    for await (const key of redis.scanIterator({ MATCH: statsKeyPattern, COUNT: 1000 })) {
        keys.push(key as string);
    }

    if (keys.length === 0) {
        return [] as unknown[];
    }

    const entries = await Promise.all(
        keys.map(async (key) => {
            const keyType = await redis.type(key);
            if (keyType === 'hash') {
                return await redis.hGetAll(key);
            }

            if (keyType === 'string') {
                const raw = await redis.get(key);
                if (raw == null) return null;
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            }

            return null;
        })
    );

    return entries;
}

export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const redis = await getRedisClient();
        const nodes = await getUserNodeStats(redis, user.id);
        return json_response(nodes, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
