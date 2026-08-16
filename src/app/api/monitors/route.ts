import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import { loadMonitorById, loadMonitorPage } from '@/app/lib/monitor';
import { parseMonitor } from '@/app/lib/monitor-input';
import type { MonitorKind, MonitorStatus } from '@/types/monitor';

const DEFAULT_LIMIT = 24;

const KINDS: MonitorKind[] = ['http', 'ssl', 'domain'];
const STATUSES: MonitorStatus[] = ['up', 'degraded', 'down', 'unknown', 'paused'];

/**
 * Validated against the known set rather than passed through.
 *
 * `status` reaches a `CASE` comparison and `kind` a column comparison, both as
 * bound parameters — so this is not what stops injection. It is what stops a
 * typo returning an empty page that reads as "you have no monitors".
 */
function parseEnum<T extends string>(raw: string | null, allowed: T[]): T | undefined {
    if (!raw) return undefined;
    return allowed.includes(raw as T) ? raw as T : undefined;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * `GET /api/monitors?kind=&status=&q=&page=&limit=` — one page, worst first.
 *
 * Filtering, ordering and paging all happen in SQL. The client receives only the
 * monitors it is about to draw, and the thirty-day history is aggregated for
 * that page rather than for every monitor the caller owns.
 */
export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const params = new URL(req.url).searchParams;

        const page = parsePositiveInt(params.get('page'), 1);
        const limit = parsePositiveInt(params.get('limit'), DEFAULT_LIMIT);
        const search = params.get('q')?.trim() || undefined;

        const { monitors, total } = await loadMonitorPage(user.id, {
            kind: parseEnum(params.get('kind'), KINDS),
            status: parseEnum(params.get('status'), STATUSES),
            search,
            limit,
            offset: (page - 1) * limit,
        });

        return json_response({ monitors, total, page, limit }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

export async function POST(req: Request) {
    try {
        const user = await verifyToken();
        const payload = await req.json().catch(() => ({})) as Record<string, unknown>;

        const parsed = parseMonitor(payload);
        if (!parsed.ok) {
            return json_response({ error: parsed.error }, 400);
        }
        const input = parsed.value;

        // The picker only ever offers the caller's own nodes, but that is a UI
        // affordance — re-check here, or a hand-written request could point a
        // monitor at somebody else's agent and have this server probe from it.
        const node = await query(
            `SELECT id FROM nodes WHERE id = $1 AND user_id = $2`,
            [input.node_id, user.id],
        );
        if (node.rowCount === 0) {
            return json_response({ error: 'Unknown agent' }, 400);
        }

        // `next_check_at` is scattered across one interval rather than set to
        // now(): monitors created together would otherwise stay in lockstep
        // forever, firing as a herd every interval with the rest idle.
        const created = await query(
            `INSERT INTO monitors (
                user_id, node_id, name, kind, target,
                interval_secs, timeout_ms, method, expected_status,
                keyword, keyword_mode, follow_redirects, degraded_ms,
                expiry_warn_days, paused, agent_offline_is_outage,
                next_check_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12, $13,
                $14, $15, $16,
                now() + make_interval(secs => random() * $17)
            )
            RETURNING id`,
            [
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
                // Bound a second time rather than reusing $6: that placeholder is
                // typed as the integer column, and reusing it inside a floating
                // point expression leaves its type ambiguous.
                input.interval_secs,
            ],
        );

        const monitor = await loadMonitorById(user.id, created.rows[0].id as string);
        return json_response({ monitor }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
