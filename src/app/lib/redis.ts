import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType> | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
    const redisUrl = process.env.REDIS_DATABASE_URL;
    if (!redisUrl) return null;

    if (!client) {
        client = createClient({ url: redisUrl });
        client.on('error', (err) => {
            console.warn('[redis] client error', err);
        });
    }

    if (!connectPromise) {
        connectPromise = client.connect().then(() => client as RedisClientType);
    }

    return connectPromise;
}
