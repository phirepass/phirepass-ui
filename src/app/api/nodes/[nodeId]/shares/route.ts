import { authzErrorStatus, requireSession } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { createShare, listShares } from '@/app/lib/node-share';

export const dynamic = 'force-dynamic';

/**
 * Who this node is shared with, and who else it could be shared with.
 *
 * `requireSession` and no permission gate, because the gate is the node itself:
 * `listShares` resolves it through `nodeManageScope`, so a session that could
 * not change this node gets a 404 and never learns who can reach it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ nodeId: string }> }) {
    try {
        const session = await requireSession();
        const { nodeId } = await ctx.params;

        return json_response(await listShares(session, nodeId), 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

/**
 * Share the node — with the whole workspace, or with one member of it.
 *
 * Answers with the refreshed list rather than the row it wrote, the way
 * `/api/org/members` does: sharing changes both lists at once (a named member
 * leaves the candidate list as they join the share list), and a caller patching
 * that locally is a caller that can disagree with the database.
 */
export async function POST(req: Request, ctx: { params: Promise<{ nodeId: string }> }) {
    try {
        const session = await requireSession();
        const { nodeId } = await ctx.params;
        const payload = await req.json().catch(() => ({})) as { audience?: unknown; user_id?: unknown };

        return json_response(await createShare(session, nodeId, payload.audience, payload.user_id), 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
