import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches the clamp on the register route, and the column is plain `text`. */
const MAX_LABEL = 120;

/**
 * Renames one subscription.
 *
 * The label is display-only — nothing routes on it — so this is the one field
 * worth letting people change. Scoped by `user_id` for the same reason DELETE
 * is: without it, a uuid would be enough to rename someone else's device.
 */

/**
 * Revokes one subscription.
 *
 * Scoped by `user_id` in the WHERE clause, not just by id: without it, knowing
 * a uuid would be enough to delete someone else's device. A miss is reported as
 * 404 whether the row belongs to another account or does not exist, so the
 * endpoint cannot be used to probe for valid ids.
 *
 * The browser's own `unsubscribe()` is the client's job — this only removes the
 * server's ability to reach it. Doing the reverse would leave the browser
 * holding a subscription nothing will ever send to.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await verifyToken();
        const { id } = await ctx.params;

        if (!UUID.test(id)) {
            return json_response({ error: 'Not found' }, 404);
        }

        const body = await req.json().catch(() => ({}));
        const label = typeof body?.label === 'string' ? body.label.trim().slice(0, MAX_LABEL) : '';

        // An empty label is rejected rather than stored: the list falls back to
        // "Unnamed device" for a null, and saving a blank would look like the
        // rename silently failed.
        if (!label) {
            return json_response({ error: 'A name is required' }, 400);
        }

        const result = await query(
            `UPDATE notification_subscriptions SET label = $1
              WHERE id = $2 AND user_id = $3
              RETURNING id`,
            [label, id, user.id],
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Not found' }, 404);
        }

        return json_response({ id, label }, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await verifyToken();
        const { id } = await ctx.params;

        if (!UUID.test(id)) {
            return json_response({ error: 'Not found' }, 404);
        }

        const result = await query(
            'DELETE FROM notification_subscriptions WHERE id = $1 AND user_id = $2',
            [id, user.id],
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Not found' }, 404);
        }

        return json_response({ ok: true }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
