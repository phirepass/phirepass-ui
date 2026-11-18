import { json_response } from '@/app/lib/framework';
import { authzErrorStatus, requireSession } from '@/app/lib/authz';
import { query } from '@/app/lib/db';
import { downloadsQuery } from '@/app/lib/downloads-scope';
import { can } from '@/lib/rbac';

/**
 * The Downloads page's first paint (screen U1): every download this session may
 * see, across nodes. **Read only.** Every change travels as a WebSocket frame
 * to the server, which checks access, records it and commands the node; the
 * dashboard never writes `downloads`.
 *
 * Visibility follows the node, as on the server: see `downloads-scope.ts`.
 * After this, the page keeps itself current from `DownloadProgress` frames.
 *
 * A database the dashboard has not migrated yet answers an empty list with
 * `available: false` rather than an error, so the page can say so.
 */
export async function GET(req: Request) {
    try {
        const session = await requireSession();
        const { sql, params } = downloadsQuery({
            orgId: session.orgId,
            userId: session.userId,
            managesAll: can(session.role, 'nodes:manage:all'),
        });

        try {
            const result = await query(sql, params);
            return json_response({ downloads: result.rows, available: true }, 200);
        } catch (error) {
            console.warn('[downloads] list unavailable:', error);
            return json_response({ downloads: [], available: false }, 200);
        }
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
