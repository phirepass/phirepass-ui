import { createClient, type RedisClientType } from "redis";

type RedisSocketOptions = NonNullable<Parameters<typeof createClient>[0]>["socket"];

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
                keepAlive: true,
                keepAliveInitialDelay: 120000,
                reconnectStrategy: (retries: number) =>
                    Math.min(1000 * 2 ** retries, 10000),
            } as RedisSocketOptions,
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

    if (client.isReady) {
        return client;
    }

    if (!connectPromise && !client.isOpen) {
        connectPromise = client
            .connect()
            .then(() => client as RedisClientType)
            .catch((error) => {
                connectPromise = null;
                throw error;
            });
    }

    return connectPromise ?? client;
}
