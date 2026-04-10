import { query } from '@/app/lib/db';
import { getRedisClient } from '@/app/lib/redis';

export async function GET() {
    const checks: Record<string, string> = {};

    try {
        await query('SELECT 1');
        checks.db = 'ok';
    } catch {
        checks.db = 'error';
    }

    if (process.env.REDIS_DATABASE_URL) {
        try {
            const redis = await getRedisClient();
            if (redis?.isReady) {
                checks.redis = 'ok';
            } else {
                checks.redis = 'error';
            }
        } catch {
            checks.redis = 'error';
        }
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    return Response.json({ status: healthy ? 'ok' : 'error', checks }, { status: healthy ? 200 : 503 });
}
