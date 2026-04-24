import { Client, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';

const sslRootCert = process.env.PGSSLROOTCERT;
const sslRejectUnauthorized = process.env.PGSSL_REJECT_UNAUTHORIZED;

const resolvePem = (value: string) => {
    if (value.includes('-----BEGIN CERTIFICATE-----')) {
        return value;
    }

    const resolvedPath = path.isAbsolute(value)
        ? value
        : path.resolve(process.cwd(), value);

    return fs.readFileSync(resolvedPath).toString();
};

const sslConfig = sslRootCert ? {
    ca: resolvePem(sslRootCert),
    rejectUnauthorized: sslRejectUnauthorized
        ? sslRejectUnauthorized.toLowerCase() === 'true'
        : true,
} : undefined;

const databaseUrl = process.env.DATABASE_URL;
const parsedUrl = databaseUrl ? new URL(databaseUrl) : null;

const clientConfig = {
    user: parsedUrl?.username || process.env.PGUSER,
    password: parsedUrl?.password || process.env.PGPASSWORD,
    host: parsedUrl?.hostname || process.env.PGHOST,
    port: parsedUrl?.port ? Number(parsedUrl.port) : (process.env.PGPORT ? Number(process.env.PGPORT) : undefined),
    database: parsedUrl?.pathname ? parsedUrl.pathname.replace(/^\//, '') : process.env.PGDATABASE,
    ssl: sslConfig,
};

let client: Client = createClient();

let clientReady: Promise<Client> | null = null;
let reconnecting: Promise<void> | null = null;

function markDisconnected() {
    clientReady = null;
}

function createClient() {
    const nextClient = new Client(clientConfig);

    nextClient.on('error', () => {
        markDisconnected();
    });

    return nextClient;
}

async function ensureConnected() {
    if (!clientReady) {
        clientReady = client.connect().catch((error) => {
            markDisconnected();
            throw error;
        });
    }

    return clientReady;
}

function isRetryableConnectionError(error: unknown) {
    const candidate = error as { code?: string; message?: string };
    const message = candidate?.message?.toLowerCase() || '';

    return candidate?.code === 'ECONNRESET'
        || candidate?.code === 'EPIPE'
        || candidate?.code === '57P01'
        || message.includes('connection terminated unexpectedly')
        || message.includes('connection ended unexpectedly')
        || message.includes('not queryable')
        || message.includes('connection closed');
}

async function reconnect() {
    if (!reconnecting) {
        reconnecting = (async () => {
            const oldClient = client;
            markDisconnected();

            try {
                await oldClient.end();
            } catch {
                // Ignore shutdown errors while forcing reconnection.
            }

            client = createClient();
            await ensureConnected();
        })().finally(() => {
            reconnecting = null;
        });
    }

    await reconnecting;
}

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
    const client = new Client(clientConfig);
    try {
        await client.connect();
        const result = await client.query(text, params);
        await client.end();
        return result;
    } catch (error) {
        await client.end();
        throw error;
    }
}

export async function getClient() {
    await ensureConnected();
    return client;
}
