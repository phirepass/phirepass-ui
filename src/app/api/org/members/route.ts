import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { getOrgSummary, listMembers } from '@/app/lib/org';

export const dynamic = 'force-dynamic';

/**
 * Everyone in the organisation, and every invitation still outstanding, as one
 * list.
 *
 * The summary rides along because the page needs both on first paint — the
 * counts above the list and the list itself — and two round trips to draw one
 * screen is two chances to show a half-loaded page.
 *
 * `users:read`, so a plain member gets 403 here. That is the same check the
 * page's own gate uses; this is the one that is true.
 */
export async function GET(req: Request) {
    try {
        const session = await requirePermission('users:read');

        const [summary, members] = await Promise.all([
            getOrgSummary(session),
            listMembers(session.orgId),
        ]);

        return json_response({ ...summary, members, self_id: session.userId }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
