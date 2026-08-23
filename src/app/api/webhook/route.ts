import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { json_response } from '@/app/lib/framework';
import {
    judgeDelivery,
    MAX_BODY_BYTES,
    recent,
    record,
    type CandidateSecret,
    type ReceivedDelivery,
} from '@/app/lib/webhook-receiver';
import type { WebhookBody } from '@/app/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * A webhook receiver, pointed at this deployment itself.
 *
 * Register `https://<host>/api/webhook` as an endpoint in the notification
 * settings and fire a test at it: the POST below verifies the signature against
 * the secret that row holds and reports what it made of the delivery, so the
 * whole chain — signing, headers, transport, clock — can be exercised without a
 * third-party receiver in the middle. It answers both senders, the dashboard's
 * own and the courier's, because they emit the same headers over the same
 * signed material.
 *
 * The POST is unauthenticated, because the courier has no session to present.
 * That is why it stores nothing durable, keeps a bounded ring in memory, reads
 * the body only up to a cap, and touches the database only once the required
 * headers are present.
 */

/** Where the request actually arrived, as the sender would have addressed it. */
function receivedAt(req: Request): { host: string | null; pathname: string } {
    const forwarded = req.headers.get('x-forwarded-host');
    const host = (forwarded ?? req.headers.get('host'))?.split(',')[0]?.trim() ?? null;

    let pathname = '/api/webhook';
    try {
        pathname = new URL(req.url).pathname;
    } catch {
        // Keep the default: this route only ever serves that path.
    }

    return { host, pathname };
}

/**
 * The secrets registered against *this* URL.
 *
 * Narrowed by host and path rather than trying every row in the table: a
 * delivery names the notification it carries, not the endpoint row that sent
 * it, so some search is unavoidable — but it should be over the rows pointing
 * here and nobody else's.
 */
async function secretsForThisUrl(req: Request): Promise<CandidateSecret[]> {
    const { host, pathname } = receivedAt(req);
    if (!host) return [];

    const result = await query(
        'SELECT id, label, url, secret FROM notification_webhooks WHERE enabled = true',
    );

    return (result.rows as Array<CandidateSecret & { url: string }>)
        .filter((row) => {
            try {
                const url = new URL(row.url);
                return url.host === host && url.pathname === pathname;
            } catch {
                return false;
            }
        })
        .map(({ id, label, secret }) => ({ id, label, secret }));
}

export async function POST(req: Request) {
    try {
        const declared = Number(req.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
            return json_response({ error: 'Body too large' }, 413);
        }

        const rawBody = await req.text();
        if (rawBody.length > MAX_BODY_BYTES) {
            return json_response({ error: 'Body too large' }, 413);
        }

        const headers = {
            signature: req.headers.get('x-phirepass-signature'),
            timestamp: req.headers.get('x-phirepass-timestamp'),
            event: req.headers.get('x-phirepass-event'),
            delivery: req.headers.get('x-phirepass-delivery'),
        };

        // Only now is the database touched: an unauthenticated endpoint should
        // not run a query for a request that was never going to verify.
        const secrets = headers.signature && headers.timestamp
            ? await secretsForThisUrl(req)
            : [];

        const verdict = judgeDelivery(headers, rawBody, secrets, Math.floor(Date.now() / 1000));

        let body: WebhookBody | string = rawBody;
        try {
            body = JSON.parse(rawBody) as WebhookBody;
        } catch {
            // Kept as text: what a receiver was sent is worth showing even when
            // it is not what it expected.
        }

        const entry: ReceivedDelivery = {
            received_at: new Date().toISOString(),
            event: headers.event,
            delivery: headers.delivery,
            verdict,
            body,
        };
        record(entry);

        console.log(
            `[webhook] ${verdict.ok ? 'verified' : 'REFUSED'} event=${headers.event ?? '-'} `
            + `delivery=${headers.delivery ?? '-'} age=${verdict.ageSeconds ?? '-'}s: ${verdict.reason}`,
        );

        return json_response(
            {
                ok: verdict.ok,
                reason: verdict.reason,
                event: headers.event,
                delivery: headers.delivery,
                age_seconds: verdict.ageSeconds,
                matched: verdict.matched,
            },
            verdict.status,
        );
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

/**
 * The deliveries this container has received.
 *
 * Behind a session, unlike the POST: a delivery body carries node names and
 * whatever else an event says about someone's infrastructure, and the POST is
 * open only because the sender cannot authenticate.
 */
export async function GET(req: Request) {
    try {
        const user = await verifyToken().catch(() => null);
        if (!user) {
            return json_response({ error: 'Unauthorized' }, 401);
        }

        return json_response({ deliveries: recent() }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
