import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import {
    WebhookUrlError,
    generateSecret,
    parseUrl,
    publicWebhook,
    secretHint,
} from '@/app/lib/webhooks';

export const dynamic = 'force-dynamic';

/*
 * Still dev-gated, unlike the rest of /api/notifications.
 *
 * The push routes shipped when the page did; these did not, because the channel
 * they serve is switched off in the UI (`WEBHOOKS_ENABLED` in
 * NotificationsPage.tsx). Nothing dispatches on events automatically yet, so an
 * endpoint registered today would only ever receive what someone pressed "test"
 * for — and an API that is unreachable from the product should not be reachable
 * from the internet either. The gate comes off in the same change that flips
 * that constant.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LABEL = 120;

/**
 * Edits one endpoint: its label, its URL, whether it is enabled, and — on
 * request — its secret.
 *
 * All four in one route because they are one form on the page, and because the
 * interesting case is a URL change: moving an endpoint resets its failure
 * history, since the counts belonged to the address it no longer points at.
 * Rotating is the one field that answers with something the caller cannot ask
 * for again, so it is opt-in rather than implied by any other edit.
 *
 * Scoped by `user_id` in every WHERE, like the device routes: without it a uuid
 * would be enough to redirect someone else's deliveries at a URL of your own.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await verifyToken();
        const { id } = await ctx.params;

        if (!UUID.test(id)) {
            return json_response({ error: 'Not found' }, 404);
        }

        const body = await req.json().catch(() => ({}));

        const sets: string[] = [];
        const values: unknown[] = [id, user.id];
        let rotated: string | null = null;

        if (body?.label !== undefined) {
            const label = typeof body.label === 'string' ? body.label.trim().slice(0, MAX_LABEL) : '';
            // Empty is rejected rather than stored: the list falls back to the
            // host for a null, and saving a blank would look like a failed save.
            if (!label) {
                return json_response({ error: 'A name is required' }, 400);
            }
            values.push(label);
            sets.push(`label = $${values.length}`);
        }

        if (body?.url !== undefined) {
            let url: string;
            try {
                url = parseUrl(body.url);
            } catch (e) {
                if (e instanceof WebhookUrlError) {
                    return json_response({ error: e.message }, 400);
                }
                throw e;
            }
            values.push(url);
            sets.push(`url = $${values.length}`);
            // The history describes the old address, not this one.
            sets.push('last_sent_at = NULL', 'last_status = NULL', 'last_error = NULL', 'fail_count = 0');
        }

        if (body?.enabled !== undefined) {
            if (typeof body.enabled !== 'boolean') {
                return json_response({ error: 'enabled must be a boolean' }, 400);
            }
            values.push(body.enabled);
            sets.push(`enabled = $${values.length}`);
        }

        if (body?.rotate_secret === true) {
            rotated = generateSecret();
            values.push(rotated);
            sets.push(`secret = $${values.length}`);
        }

        if (sets.length === 0) {
            return json_response({ error: 'Nothing to update' }, 400);
        }

        let result;
        try {
            result = await query(
                `UPDATE notification_webhooks SET ${sets.join(', ')}
                WHERE id = $1 AND user_id = $2
                RETURNING id, label, url, secret, enabled, created_at,
                            last_sent_at, last_status, last_error, fail_count`,
                values,
            );
        } catch (e) {
            // The per-user unique index — the new URL is already registered.
            if ((e as { code?: string }).code === '23505') {
                return json_response({ error: 'That URL is already registered' }, 409);
            }
            throw e;
        }

        if (result.rowCount === 0) {
            return json_response({ error: 'Not found' }, 404);
        }

        return json_response({
            webhook: publicWebhook(result.rows[0]),
            // Present only on a rotation, and only this once.
            ...(rotated ? { secret: rotated, secret_hint: secretHint(rotated) } : {}),
        }, 200);
    } catch (e) {
        console.warn(`[server][patch][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

/**
 * Removes one endpoint. A miss answers 404 whether the row belongs to another
 * account or never existed, so this cannot be used to probe for valid ids.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await verifyToken();
        const { id } = await ctx.params;

        if (!UUID.test(id)) {
            return json_response({ error: 'Not found' }, 404);
        }

        const result = await query(
            'DELETE FROM notification_webhooks WHERE id = $1 AND user_id = $2',
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
