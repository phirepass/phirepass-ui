import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType> | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
    const redisUrl = process.env.REDIS_DATABASE_URL;
    if (!redisUrl) return null;

    if (!client) {
        const redisHost = new URL(redisUrl).hostname;
        client = createClient({
            url: redisUrl,
            pingInterval: 30000,
            socket: {
                tls: redisUrl.startsWith("rediss://"),
                servername: redisHost,
                keepAlive: 120000,
                reconnectStrategy: (retries) =>
                    Math.min(1000 * 2 ** retries, 10000),
            },
        });
        client.on("error", (err) => {
            console.warn("[redis] client error", err);
            if (client && !client.isOpen) {
                connectPromise = null;
            }
        });
        client.on("end", () => {
            connectPromise = null;
        });
    }

    if (!connectPromise || !client.isReady) {
        connectPromise = client.connect().then(() => client as RedisClientType);
    }

    return connectPromise;
}
