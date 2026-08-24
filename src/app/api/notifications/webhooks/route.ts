import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import {
    WebhookUrlError,
    defaultLabel,
    generateSecret,
    listWebhooks,
    parseUrl,
    publicWebhook,
    secretHint,
} from '@/app/lib/webhooks';

export const dynamic = 'force-dynamic';

/** Matches the label clamp on the device routes; the column is plain `text`. */
const MAX_LABEL = 120;

/** How many endpoints one account may hold. */
const MAX_ENDPOINTS = 20;

/**
 * The webhook endpoints registered for the signed-in account.
 *
 * Secrets never appear here — only `secret_hint`. See `publicWebhook`: the
 * secret is handed over once, by POST, and after that the only way to get a
 * usable one is to rotate it, which invalidates the old one at the same time.
 */
export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const rows = await listWebhooks(user.id);

        return json_response({ webhooks: rows.map(publicWebhook) }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

/**
 * Registers an endpoint, minting its signing secret.
 *
 * The response is the only time the full secret exists outside the database
 * row, so the client shows it once and says so. A second POST of the same URL
 * is a conflict rather than an upsert — silently replacing the secret of an
 * endpoint that is already delivering would break the receiver that holds it.
 */
export async function POST(req: Request) {
    try {
        const user = await verifyToken();
        const body = await req.json().catch(() => ({}));

        let url: string;
        try {
            url = parseUrl(body?.url);
        } catch (e) {
            if (e instanceof WebhookUrlError) {
                return json_response({ error: e.message }, 400);
            }
            throw e;
        }

        const label = typeof body?.label === 'string' && body.label.trim()
            ? body.label.trim().slice(0, MAX_LABEL)
            : defaultLabel(url);

        const existing = await query(
            'SELECT count(*)::int AS count FROM notification_webhooks WHERE user_id = $1',
            [user.id],
        );
        if (existing.rows[0].count >= MAX_ENDPOINTS) {
            return json_response(
                { error: `An account can hold ${MAX_ENDPOINTS} webhook endpoints` },
                409,
            );
        }

        const secret = generateSecret();

        // `DO NOTHING` on the per-user unique index, then a zero row count is
        // the duplicate — cheaper and race-free compared to checking first.
        const result = await query(
            `INSERT INTO notification_webhooks (user_id, label, url, secret)
                VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, url) DO NOTHING
                RETURNING id, label, url, secret, enabled, created_at,
                        last_sent_at, last_status, last_error, fail_count`,
            [user.id, label, url, secret],
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'That URL is already registered' }, 409);
        }

        return json_response({
            webhook: publicWebhook(result.rows[0]),
            // Shown once. Named `secret` rather than folded into the row so it
            // is obvious at the call site that this response is the sensitive
            // one and a list response is not.
            secret,
            secret_hint: secretHint(secret),
        }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
