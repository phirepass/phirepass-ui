import { authzErrorStatus, nodeScope, requireSession, scopeAppended, scopeAt } from '@/app/lib/authz';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import { loadMonitorById, loadMonitorDetail } from '@/app/lib/monitor';
import { parseMonitor, type ParsedMonitor } from '@/app/lib/monitor-input';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const session = await requireSession();
        const { monitorId } = await params;

        const detail = await loadMonitorDetail(session, monitorId);
        if (!detail) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        return json_response(detail, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const session = await requireSession();
        const { monitorId } = await params;
        const payload = await req.json().catch(() => ({})) as Record<string, unknown>;

        // `$1` is the caller's own id everywhere in this route, which is what
        // lets the scope be appended rather than renumbered through eighteen
        // placeholders. See `scopeAppended`.
        const monitorScope = scopeAppended(session, 'monitors:read:all', 'm', 2);

        // The current row supplies defaults, so a PATCH carrying only `paused`
        // keeps every other field rather than resetting it to the schema default.
        const existing = await query(
            `SELECT name, kind, target, node_id, interval_secs, timeout_ms, method,
                    expected_status, keyword, keyword_mode, follow_redirects,
                    degraded_ms, expiry_warn_days, paused, agent_offline_is_outage
            FROM monitors m
            WHERE m.id = $2 AND ${monitorScope.sql}`,
            [session.userId, monitorId, ...monitorScope.params],
        );
        if (existing.rowCount === 0) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        const parsed = parseMonitor(payload, existing.rows[0] as Partial<ParsedMonitor>);
        if (!parsed.ok) {
            return json_response({ error: parsed.error }, 400);
        }
        const input = parsed.value;

        const nodeAccess = scopeAt(nodeScope(session, 'n'), 1);
        const node = await query(
            `SELECT n.id FROM nodes n WHERE n.id = $1 AND ${nodeAccess.sql}`,
            [input.node_id, ...nodeAccess.params],
        );
        if (node.rowCount === 0) {
            return json_response({ error: 'Unknown agent' }, 400);
        }

        // `LEAST` matters when the interval is shortened: a monitor moved from
        // daily to five-minutely would otherwise keep the due time its old
        // cadence set and sit idle until then.
        const updateScope = scopeAppended(session, 'monitors:read:all', 'monitors', 18);
        const updated = await query(
            `UPDATE monitors
            SET node_id = $3, name = $4, kind = $5, target = $6,
                interval_secs = $7, timeout_ms = $8, method = $9,
                expected_status = $10, keyword = $11, keyword_mode = $12,
                follow_redirects = $13, degraded_ms = $14, expiry_warn_days = $15,
                paused = $16, agent_offline_is_outage = $17,
                next_check_at = LEAST(next_check_at, now() + make_interval(secs => $18))
            WHERE id = $2 AND ${updateScope.sql}
            RETURNING id`,
            [
                session.userId,
                monitorId,
                input.node_id,
                input.name,
                input.kind,
                input.target,
                input.interval_secs,
                input.timeout_ms,
                input.method,
                input.expected_status,
                input.keyword,
                input.keyword_mode,
                input.follow_redirects,
                input.degraded_ms,
                input.expiry_warn_days,
                input.paused,
                input.agent_offline_is_outage,
                input.interval_secs,
                ...updateScope.params,
            ],
        );
        if (updated.rowCount === 0) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        const monitor = await loadMonitorById(session, monitorId);
        return json_response({ monitor }, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const session = await requireSession();
        const { monitorId } = await params;
        const scope = scopeAppended(session, 'monitors:read:all', 'monitors', 2);

        // Checks and incidents go with it via ON DELETE CASCADE, which is what
        // the confirmation dialog warns about.
        const result = await query(
            `DELETE FROM monitors WHERE id = $2 AND ${scope.sql} RETURNING id`,
            [session.userId, monitorId, ...scope.params],
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        return json_response({ id: monitorId }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
