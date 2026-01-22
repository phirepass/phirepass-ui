import { cookies } from 'next/headers';
import { verifyJWT } from '@/app/lib/auth';
import { query } from '@/app/lib/db';

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

function hasSub(p: unknown): p is { sub: string } {
  return typeof p === 'object' && p !== null && 'sub' in p && typeof (p as { sub?: unknown }).sub === 'string';
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    const payload = verifyJWT(token);
    if (!hasSub(payload)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const userId = payload.sub;
    const id = params.id;

    const body = await req.json().catch(() => ({}));
    const name: string | undefined = body?.name;
    const status: 'active' | 'revoked' | undefined = body?.status;
    const expiresAt: string | undefined = body?.expiresAt;

    await ensureTable();
    const result = await query('SELECT user_id FROM api_keys WHERE id = $1', [id]);
    if (result.rowCount === 0 || result.rows[0].user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (expiresAt) { updates.push(`expires_at = $${idx++}`); values.push(new Date(expiresAt)); }
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No changes' }), { status: 400 });
    }

    values.push(id);
    await query(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = $${idx}`, values);

    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    const payload = verifyJWT(token);
    if (!hasSub(payload)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const userId = payload.sub;
    const id = params.id;

    await ensureTable();
    const result = await query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [id, userId]);
    if (result.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
