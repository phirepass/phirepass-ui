import { json_response } from '@/app/lib/framework';
import { verifyToken } from '@/app/lib/auth';
import { getRedisClient } from '@/app/lib/redis';

async function getUserNodeStats(redis: Awaited<ReturnType<typeof getRedisClient>>, userId: string) {
    if (!redis) return [] as unknown[];

    const statsKeyPattern = `phirepass:users:${userId}:nodes:*`;
    const keys: string[] = [];

    console.log(`[server][getUserNodeStats] scanning keys with pattern: ${statsKeyPattern}`);
    for await (const key of redis.scanIterator({ MATCH: statsKeyPattern, COUNT: 100 })) {
        keys.push(key as string);
    }

    const entries = [];

    for (const key of keys) {
        const stats = await redis.hGet(key, "stats");
        if (stats) {
            entries.push(JSON.parse(stats));
        }
    }

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
