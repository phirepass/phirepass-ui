import { authzErrorStatus } from '@/app/lib/authz';
import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { listMemberships, setActiveOrganization } from '@/app/lib/org';

export const dynamic = 'force-dynamic';

/**
 * The workspaces this account belongs to, and which one its session runs in.
 *
 * `verifyToken` rather than `requireSession`, which is the one place in
 * `/api/org` that distinction matters. `requireSession` resolves a membership
 * and refuses a suspended one with 403 — correct everywhere else, and exactly
 * wrong here: somebody suspended in the workspace they happen to be in would be
 * unable to list the workspaces they could move to, which is the only way out.
 * This route is about the account, not about any one organisation, so it asks
 * only who is calling.
 *
 * That also means no `ensurePersonalOrg` bootstrap. An account with no
 * membership at all gets an empty list rather than a workspace created as a side
 * effect of opening a menu; `/api/profile` has already done that by the time
 * anything renders the switcher.
 */
export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        return json_response({ workspaces: await listMemberships(user.id) }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

/**
 * Switch the session into another workspace.
 *
 * No permission gate beyond membership: choosing which of your own workspaces
 * you are looking at is not an organisation-scoped action, and the role you hold
 * in the destination is whatever it is — the switch does not grant anything the
 * next request would not have granted anyway.
 */
export async function PATCH(req: Request) {
    try {
        const user = await verifyToken();
        const payload = await req.json().catch(() => ({})) as { org_id?: unknown };
        const membership = await setActiveOrganization(user.id, payload.org_id);

        return json_response(membership, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
