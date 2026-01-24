import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { query } from '@/app/lib/db';

export async function GET(req: Request) {
    try {
        const user = await verifyToken();

        // Fetch all tokens for this user with node count
        const result = await query(
            `SELECT
                p.id,
                p.token_id,
                p.name,
                p.scopes,
                p.created_at,
                p.expires_at,
                COUNT(n.id) as node_count,
                CASE
                    WHEN p.expires_at IS NOT NULL AND p.expires_at < NOW() THEN 'expired'
                    ELSE 'active'
                END as status
             FROM pat_tokens p
             LEFT JOIN nodes n ON n.token_id = p.id
             WHERE p.user_id = $1
             GROUP BY p.id, p.token_id, p.name, p.scopes, p.created_at, p.expires_at
             ORDER BY p.created_at DESC`,
            [user.id]
        );

        return json_response({ tokens: result.rows }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
