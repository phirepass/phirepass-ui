import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { listMembers, revokeInvitation } from '@/app/lib/org';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Withdraw an invitation that has not been accepted.
 *
 * `revoked_at` rather than a delete, matching how the rest of the product
 * records access being taken away: who was asked in and then un-asked is part of
 * the answer to "who could have reached this", which is the question the audit
 * log (roadmap B1) will be asked to answer.
 *
 * Scoped by `org_id` in the same statement, so an invitation id from another
 * workspace is a 404 rather than a revocation.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ invitationId: string }> }) {
    try {
        const session = await requirePermission('users:invite');
        const { invitationId } = await ctx.params;

        if (!UUID.test(invitationId)) {
            return json_response({ error: 'That invitation is no longer outstanding' }, 404);
        }

        await revokeInvitation(session, invitationId);

        return json_response({ members: await listMembers(session.orgId) }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
