import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { getOrgSummary, renameOrganization } from '@/app/lib/org';

export const dynamic = 'force-dynamic';

/**
 * The organisation this session is in, and the caller's own role in it.
 *
 * `org:read` rather than no check at all: the permission is held by every role,
 * so the gate never refuses anybody who belongs here — but it is the same shape
 * as every other route, and a role added later that should not see the member
 * counts is then a change to one table rather than a route somebody has to
 * remember.
 */
export async function GET(req: Request) {
    try {
        const session = await requirePermission('org:read');
        return json_response(await getOrgSummary(session), 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

/**
 * Rename the workspace. Owner only — it is the name on the invoice, and
 * `org:manage` is not granted to admins.
 */
export async function PATCH(req: Request) {
    try {
        const session = await requirePermission('org:manage');
        const payload = await req.json().catch(() => ({})) as { name?: unknown };

        if (typeof payload.name !== 'string') {
            return json_response({ error: 'A workspace name is required' }, 400);
        }

        const org = await renameOrganization(session, payload.name);
        return json_response(org, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
