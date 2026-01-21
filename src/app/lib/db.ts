import { Pool, QueryResult } from 'pg';

const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
});

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
    return pool.query(text, params)
}

export async function getClient() {
    return pool.connect()
}
