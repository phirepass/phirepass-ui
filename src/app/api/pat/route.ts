import { cookies } from 'next/headers';
import { verifyJWT } from '@/app/lib/auth';
import { query } from '@/app/lib/db';

function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function hasSub(p: unknown): p is { sub: string } {
  return typeof p === 'object' && p !== null && 'sub' in p && typeof (p as { sub?: unknown }).sub === 'string';
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key TEXT NOT NULL,
      prefix TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      scopes JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','revoked'))
    )
  `);
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    const payload = verifyJWT(token);
    if (!hasSub(payload)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const userId = payload.sub;
    await ensureTable();
    const result = await query(
      `SELECT id, name, prefix, created_at, last_used_at, expires_at, scopes, status FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return new Response(JSON.stringify(result.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const payload = verifyJWT(token);
    if (!hasSub(payload)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const userId = payload.sub;

    const body = await req.json().catch(() => ({}));
    const name = body?.name ?? 'New Token';
    const scopes = Array.isArray(body?.scopes) ? body.scopes : ['api:full'];

    const prefix = process.env.NODE_ENV === 'production' ? 'pp_live_' : 'pp_test_';
    const key = `${prefix}${generateApiKey()}`;

    await ensureTable();
    const id = `key-${Date.now()}`;
    const createdAt = new Date();
    await query(
      `INSERT INTO api_keys (id, user_id, name, key, prefix, created_at, scopes, status) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [id, userId, name, key, prefix, createdAt, JSON.stringify(scopes), 'active']
    );

    const response = { id, name, key, prefix, createdAt: createdAt.toISOString(), scopes, status: 'active' as const };
    return new Response(JSON.stringify(response), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
