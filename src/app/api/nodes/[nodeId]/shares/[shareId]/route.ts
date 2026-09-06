import { authzErrorStatus, requireSession } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { revokeShare } from '@/app/lib/node-share';

export const dynamic = 'force-dynamic';

/**
 * Withdraw a share.
 *
 * Scoped by node *and* organisation in the same statement, so a share id from
 * somewhere else is a 404 rather than a revocation.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ nodeId: string; shareId: string }> }) {
    try {
        const session = await requireSession();
        const { nodeId, shareId } = await ctx.params;

        return json_response(await revokeShare(session, nodeId, shareId), 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
