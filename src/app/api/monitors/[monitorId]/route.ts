import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import { loadMonitorDetail, loadMonitors } from '@/app/lib/monitor';
import { parseMonitor, type ParsedMonitor } from '@/app/lib/monitor-input';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const user = await verifyToken();
        const { monitorId } = await params;

        const detail = await loadMonitorDetail(user.id, monitorId);
        if (!detail) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        return json_response(detail, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const user = await verifyToken();
        const { monitorId } = await params;
        const payload = await req.json().catch(() => ({})) as Record<string, unknown>;

        // The current row supplies defaults, so a PATCH carrying only `paused`
        // keeps every other field rather than resetting it to the schema default.
        const existing = await query(
            `SELECT name, kind, target, node_id, interval_secs, timeout_ms, method,
                    expected_status, keyword, keyword_mode, follow_redirects,
                    degraded_ms, expiry_warn_days, paused, agent_offline_is_outage
            FROM monitors
            WHERE id = $1 AND user_id = $2`,
            [monitorId, user.id],
        );
        if (existing.rowCount === 0) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        const parsed = parseMonitor(payload, existing.rows[0] as Partial<ParsedMonitor>);
        if (!parsed.ok) {
            return json_response({ error: parsed.error }, 400);
        }
        const input = parsed.value;

        const node = await query(
            `SELECT id FROM nodes WHERE id = $1 AND user_id = $2`,
            [input.node_id, user.id],
        );
        if (node.rowCount === 0) {
            return json_response({ error: 'Unknown agent' }, 400);
        }

        // `LEAST` matters when the interval is shortened: a monitor moved from
        // daily to five-minutely would otherwise keep the due time its old
        // cadence set and sit idle until then.
        const updated = await query(
            `UPDATE monitors
            SET node_id = $3, name = $4, kind = $5, target = $6,
                interval_secs = $7, timeout_ms = $8, method = $9,
                expected_status = $10, keyword = $11, keyword_mode = $12,
                follow_redirects = $13, degraded_ms = $14, expiry_warn_days = $15,
                paused = $16, agent_offline_is_outage = $17,
                next_check_at = LEAST(next_check_at, now() + make_interval(secs => $18))
            WHERE id = $1 AND user_id = $2
            RETURNING id`,
            [
                monitorId,
                user.id,
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
            ],
        );
        if (updated.rowCount === 0) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        const [monitor] = await loadMonitors(user.id, monitorId);
        return json_response({ monitor }, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ monitorId: string }> },
) {
    try {
        const user = await verifyToken();
        const { monitorId } = await params;

        // Checks and incidents go with it via ON DELETE CASCADE, which is what
        // the confirmation dialog warns about.
        const result = await query(
            `DELETE FROM monitors WHERE id = $1 AND user_id = $2 RETURNING id`,
            [monitorId, user.id],
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Monitor not found' }, 404);
        }

        return json_response({ id: monitorId }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
