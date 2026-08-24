import { randomBytes } from 'crypto';

import { query } from '@/app/lib/db';
import { signBody, verifySignature } from '@/app/lib/webhook-signature';
import { WebhookUrlError, defaultLabel, parseUrl } from '@/app/lib/webhook-url';

/**
 * Webhooks, server half — the other delivery channel beside `push.ts`.
 *
 * The two are deliberately shaped alike: a `list*` for the settings page, and a
 * `sendTo*` that fans out to everything the account has registered and records
 * what came back. What differs is who is trusted. A push endpoint is issued by
 * a browser's push service and can only be reached through it; a webhook URL is
 * typed in by a person, and this server then makes an outbound request to it —
 * which is a request-forgery primitive if left unguarded, hence `parseUrl`.
 */

export interface StoredWebhook {
    id: string;
    label: string | null;
    url: string;
    secret: string;
    enabled: boolean;
    created_at: Date;
    last_sent_at: Date | null;
    last_status: number | null;
    last_error: string | null;
    fail_count: number;
}

/** Long enough that guessing is hopeless, short enough to paste in one line. */
const SECRET_BYTES = 24;

export function generateSecret(): string {
    return randomBytes(SECRET_BYTES).toString('base64url');
}

/**
 * What the list is allowed to show. Four characters identifies which secret a
 * row holds without being enough to sign anything.
 */
export function secretHint(secret: string): string {
    return secret.slice(-4);
}

// Re-exported so every existing importer keeps one place to reach for, while
// the scheme itself lives somewhere a receiver can use without a database.
export { signBody, verifySignature };
export { WebhookUrlError, defaultLabel, parseUrl };

export async function listWebhooks(userId: string): Promise<StoredWebhook[]> {
    const result = await query(
        `SELECT id, label, url, secret, enabled, created_at,
                last_sent_at, last_status, last_error, fail_count
            FROM notification_webhooks
        WHERE user_id = $1
        ORDER BY created_at`,
        [userId],
    );

    return result.rows as StoredWebhook[];
}

/** The wire shape of one delivery. Kept flat, and named as the courier names it. */
export interface WebhookBody {
    id: string;
    event: string;
    kind: 'webhook';
    sent_at: string;
    payload: Record<string, unknown>;
}

export interface WebhookDelivery {
    /** Null when the request never got an answer — DNS, refused, timed out. */
    status: number | null;
    error: string | null;
    ok: boolean;
}

/** A receiver that has not answered in ten seconds is not going to. */
const TIMEOUT_MS = 10_000;

/**
 * Delivers one body to one endpoint and records the outcome on its row.
 *
 * Any answer at all is a success in the transport sense but not in this one:
 * only 2xx clears `fail_count`. A 404 from a receiver that has moved is exactly
 * the state the list needs to show as failing, and treating "we got a reply" as
 * healthy would hide it.
 */
async function deliver(endpoint: StoredWebhook, body: WebhookBody): Promise<WebhookDelivery> {
    const serialised = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    let status: number | null = null;
    let error: string | null = null;

    try {
        const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'phirepass-webhooks/1',
                'X-Phirepass-Event': body.event,
                'X-Phirepass-Delivery': body.id,
                'X-Phirepass-Timestamp': timestamp,
                'X-Phirepass-Signature': `sha256=${signBody(endpoint.secret, timestamp, serialised)}`,
            },
            body: serialised,
            signal: AbortSignal.timeout(TIMEOUT_MS),
            // A webhook is a delivery, not a browse: a receiver answering 302
            // to somewhere else is a misconfiguration we should report rather
            // than follow, and following it would sidestep `parseUrl`.
            redirect: 'manual',
        });
        status = response.status;
        if (status < 200 || status >= 300) {
            error = `The endpoint answered ${status}`;
        }
    } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 200) : 'The request failed';
    }

    const ok = status !== null && status >= 200 && status < 300;

    await query(
        `UPDATE notification_webhooks
            SET last_sent_at = now(),
                last_status  = $2,
                last_error   = $3,
                fail_count   = CASE WHEN $4 THEN 0 ELSE fail_count + 1 END
        WHERE id = $1`,
        [endpoint.id, status, error, ok],
    );

    return { status, error, ok };
}

export interface WebhookOutcome {
    sent: number;
    failed: number;
    /** Endpoints skipped because they are switched off. */
    skipped: number;
}

/**
 * Sends one event to every enabled endpoint on an account.
 *
 * The push side prunes subscriptions the push service disowns; there is no
 * equivalent here. A URL that 404s today may be a receiver mid-deploy, and
 * nobody else can tell us it is gone for good — so failures are recorded and
 * shown, and removing the endpoint stays a decision a person makes.
 */
export async function sendToUserWebhooks(
    userId: string,
    event: string,
    payload: Record<string, unknown>,
): Promise<WebhookOutcome> {
    const endpoints = await listWebhooks(userId);
    const active = endpoints.filter((endpoint) => endpoint.enabled);

    const results = await Promise.all(active.map((endpoint) => deliver(endpoint, {
        id: crypto.randomUUID(),
        event,
        kind: 'webhook',
        sent_at: new Date().toISOString(),
        payload,
    })));

    return {
        sent: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        skipped: endpoints.length - active.length,
    };
}

/**
 * Sends one event to a single endpoint, by id, scoped to its owner.
 *
 * Unlike the fan-out, this ignores `enabled`: testing an endpoint you have just
 * switched off — to find out whether it is worth switching back on — is the
 * reason the button is there.
 */
export async function sendToWebhook(
    userId: string,
    id: string,
    event: string,
    payload: Record<string, unknown>,
): Promise<WebhookDelivery | null> {
    const result = await query(
        `SELECT id, label, url, secret, enabled, created_at,
                last_sent_at, last_status, last_error, fail_count
            FROM notification_webhooks
        WHERE id = $1 AND user_id = $2`,
        [id, userId],
    );

    const endpoint = result.rows[0] as StoredWebhook | undefined;
    if (!endpoint) return null;

    return deliver(endpoint, {
        id: crypto.randomUUID(),
        event,
        kind: 'webhook',
        sent_at: new Date().toISOString(),
        payload,
    });
}

/**
 * The row as the client is allowed to see it — everything except the secret,
 * which is replaced by its hint. One function rather than a mapping repeated in
 * each route, because the whole point is that no route accidentally returns the
 * column.
 */
export function publicWebhook(row: StoredWebhook) {
    return {
        id: row.id,
        name: row.label ?? defaultLabel(row.url),
        url: row.url,
        secret_hint: secretHint(row.secret),
        enabled: row.enabled,
        created_at: row.created_at.toISOString(),
        last_sent_at: row.last_sent_at?.toISOString() ?? null,
        last_status: row.last_status,
        last_error: row.last_error,
        fail_count: row.fail_count,
    };
}
