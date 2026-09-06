import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { listMembers, parseRole, removeMember, setMemberRole, setMemberSuspended } from '@/app/lib/org';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Change one member: their role, or whether they are suspended.
 *
 * Both in one route because they are one row and one form, and because the
 * rules that guard them are the same three — you cannot act on yourself, an
 * admin cannot act on an owner, and the last owner cannot be demoted or
 * suspended. Those live in `src/app/lib/org.ts`, which is also where the
 * transfer of ownership happens as a single statement.
 *
 * Answers with the whole refreshed list rather than the changed row: a role
 * change can move two rows (a transfer demotes the actor) and a suspension
 * changes what the caller may do next, so re-reading is both cheaper to reason
 * about and what the page was going to do anyway.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
    try {
        const session = await requirePermission('users:manage');
        const { userId } = await ctx.params;

        if (!UUID.test(userId)) {
            return json_response({ error: 'That person is not in this workspace' }, 404);
        }

        const payload = await req.json().catch(() => ({})) as { role?: unknown; suspended?: unknown };

        const wantsRole = payload.role !== undefined;
        const wantsSuspension = payload.suspended !== undefined;

        if (!wantsRole && !wantsSuspension) {
            return json_response({ error: 'Nothing to change' }, 400);
        }

        // Deliberately not both at once. "Suspend and demote" reads as one
        // action but is two decisions, and the invariant checks would have to
        // agree about which order they happened in.
        if (wantsRole && wantsSuspension) {
            return json_response({ error: 'Change a role or a suspension, not both' }, 400);
        }

        if (wantsRole) {
            await setMemberRole(session, userId, parseRole(payload.role));
        } else {
            if (typeof payload.suspended !== 'boolean') {
                return json_response({ error: 'suspended must be true or false' }, 400);
            }
            await setMemberSuspended(session, userId, payload.suspended);
        }

        return json_response({ members: await listMembers(session.orgId) }, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

/**
 * Remove somebody from the organisation.
 *
 * Their nodes, tokens and monitors stay: they belong to the organisation, not
 * to the person who enrolled them, and a team that loses a machine because
 * somebody left has lost the wrong thing. The response says how much was left
 * behind so the page can name it.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ userId: string }> }) {
    try {
        const session = await requirePermission('users:manage');
        const { userId } = await ctx.params;

        if (!UUID.test(userId)) {
            return json_response({ error: 'That person is not in this workspace' }, 404);
        }

        const removed = await removeMember(session, userId);

        return json_response(
            { removed, members: await listMembers(session.orgId) },
            200,
        );
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
