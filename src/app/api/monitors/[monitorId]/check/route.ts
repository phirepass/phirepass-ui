import { authzErrorStatus, requireSession, scopeAppended } from '@/app/lib/authz';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import { loadMonitorById } from '@/app/lib/monitor';

/**
 * "Check now" — brings the next check forward rather than running one.
 *
 * A probe can only be dispatched by the Rust server holding that agent's
 * WebSocket, and this process has no path to it. So the request marks the
 * monitor due and the next scheduler tick picks it up, which is why the UI says
 * "queued" rather than reporting a result.
 *
 * A paused monitor is refused instead of being quietly resumed: the scheduler
 * skips paused rows, so marking one due would do nothing and the toast would
 * lie.
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const session = await requireSession();
        const { monitorId } = await params;
        const scope = scopeAppended(session, 'monitors:read:all', 'monitors', 2);

        const result = await query(
            `UPDATE monitors
            SET next_check_at = now()
            WHERE id = $2 AND ${scope.sql} AND NOT paused
            RETURNING id`,
            [session.userId, monitorId, ...scope.params],
        );

        if (result.rowCount === 0) {
            const exists = await query(
                `SELECT paused FROM monitors WHERE id = $2 AND ${scope.sql}`,
                [session.userId, monitorId, ...scope.params],
            );
            if (exists.rowCount === 0) {
                return json_response({ error: 'Monitor not found' }, 404);
            }
            return json_response({ error: 'Resume the monitor before checking it' }, 409);
        }

        const monitor = await loadMonitorById(session, monitorId);
        return json_response({ monitor }, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
