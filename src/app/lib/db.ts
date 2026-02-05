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

const client = new Client({
    user: parsedUrl?.username || process.env.PGUSER,
    password: parsedUrl?.password || process.env.PGPASSWORD,
    host: parsedUrl?.hostname || process.env.PGHOST,
    port: parsedUrl?.port ? Number(parsedUrl.port) : (process.env.PGPORT ? Number(process.env.PGPORT) : undefined),
    database: parsedUrl?.pathname ? parsedUrl.pathname.replace(/^\//, '') : process.env.PGDATABASE,
    ssl: sslConfig,
});

let clientReady: Promise<void> | null = null;

async function ensureConnected() {
    if (!clientReady) {
        clientReady = client.connect();
    }

    return clientReady;
}

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
    await ensureConnected();
    return client.query(text, params)
}

export async function getClient() {
    await ensureConnected();
    return client
}
