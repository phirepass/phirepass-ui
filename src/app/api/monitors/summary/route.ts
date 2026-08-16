import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { loadMonitorOverview } from '@/app/lib/monitor-summary';
import type { MonitorKind } from '@/types/monitor';

const KINDS: MonitorKind[] = ['http', 'ssl', 'domain'];

/**
 * `GET /api/monitors/summary[?kind=http]` — counts, not monitors.
 *
 * Unscoped it is everything `/dashboard/monitors` renders: per-kind totals,
 * status tallies, 24h uptime, the worst monitor and the next expiry. No monitor
 * rows and no check history, so the response size is fixed by the number of
 * kinds rather than by how many monitors the caller owns.
 *
 * Scoped by `kind` it also carries that kind's problem list, which is what its
 * page's alert strip and filter chips are built from.
 */
export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const raw = new URL(req.url).searchParams.get('kind');
        // An unrecognised kind is refused rather than silently widened to "all",
        // which would answer a scoped request with unscoped data.
        if (raw && !KINDS.includes(raw as MonitorKind)) {
            return json_response({ error: 'Unknown monitor kind' }, 400);
        }

        const overview = await loadMonitorOverview(user.id, (raw as MonitorKind) ?? undefined);
        return json_response(overview, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
