import { authzErrorStatus, ownedScope, requireSession } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { query } from '@/app/lib/db';

export async function GET(req: Request) {
    try {
        const session = await requireSession();
        const scope = ownedScope(session, 'tokens:read:all', 'p');

        // Every token this session may see. A token's secret is never returned
        // by any query in this file — `tokens:read:all` lets an administrator
        // know one exists and revoke it, not use it.
        const result = await query(
            `SELECT
                p.id,
                p.token_id,
                p.name,
                p.scopes,
                p.created_at,
                p.expires_at,
                p.last_used_at,
                p.user_id,
                CASE
                    WHEN p.expires_at IS NOT NULL AND p.expires_at < NOW() THEN 'expired'
                    ELSE 'active'
                END as status
            FROM pat_tokens p
            WHERE ${scope.sql}
            ORDER BY p.last_used_at DESC NULLS LAST, p.created_at DESC`,
            scope.params
        );

        return json_response({ tokens: result.rows }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
