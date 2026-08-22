import { createHash } from 'crypto';
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';

import { query } from '@/app/lib/db';

/**
 * Web Push, server half.
 *
 * VAPID identifies *this application server* to the browser's push service. The
 * public half is handed to the browser at subscribe time (via `/api/config`,
 * as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) and is baked into the subscription; the
 * private half signs every send. Rotating the keys therefore invalidates every
 * existing subscription — they are long-lived credentials, not a session secret.
 */

export interface StoredSubscription {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    label: string | null;
    platform: string | null;
    browser: string | null;
    created_at: Date;
    last_active_at: Date;
}

let configured = false;

/**
 * Configures `web-push` on first use and reports whether push is available at
 * all. Returns false rather than throwing when the keys are absent, so a
 * deployment without them degrades to "notifications unavailable" instead of
 * 500ing every request on this surface.
 */
export function pushConfigured(): boolean {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        return false;
    }

    if (!configured) {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'mailto:support@phirepass.io',
            publicKey,
            privateKey,
        );
        configured = true;
    }

    return true;
}

/**
 * A stable, non-reversible handle for a subscription endpoint.
 *
 * The endpoint is a capability URL — anything holding it can ask the push
 * service to wake that browser — so it never leaves the server. The client
 * hashes its own endpoint the same way to work out which row in the list is the
 * browser it is running in.
 */
export function endpointHash(endpoint: string): string {
    return createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

export async function listSubscriptions(userId: string): Promise<StoredSubscription[]> {
    const result = await query(
        `SELECT id, endpoint, p256dh, auth, label, platform, browser, created_at, last_active_at
           FROM notification_subscriptions
          WHERE user_id = $1
          ORDER BY last_active_at DESC`,
        [userId],
    );

    return result.rows as StoredSubscription[];
}

export interface DeliveryOutcome {
    sent: number;
    /** Subscriptions the push service disowned; already deleted by the caller. */
    pruned: number;
}

export interface PushPayload {
    title: string;
    body: string;
    /** Same tag replaces rather than stacks in the notification shade. */
    tag?: string;
    /** Where a click should land. */
    url?: string;
}

/**
 * Sends one payload to every subscription belonging to a user.
 *
 * Push services answer 404 or 410 for a subscription the browser has thrown
 * away — uninstalled, permission revoked, profile wiped. Those are the only
 * signal that a row is dead, so they are deleted on the spot; anything else is
 * logged and left alone, because a transient 5xx from FCM is not a reason to
 * forget someone's phone.
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<DeliveryOutcome> {
    if (!pushConfigured()) {
        return { sent: 0, pruned: 0 };
    }

    const subscriptions = await listSubscriptions(userId);
    const body = JSON.stringify(payload);
    const dead: string[] = [];
    let sent = 0;

    await Promise.all(subscriptions.map(async (row) => {
        const subscription: WebPushSubscription = {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
        };

        try {
            await webpush.sendNotification(subscription, body);
            sent += 1;
        } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
                dead.push(row.id);
                return;
            }
            console.warn('[push] send failed', status, (error as Error).message);
        }
    }));

    if (dead.length > 0) {
        await query('DELETE FROM notification_subscriptions WHERE id = ANY($1::uuid[])', [dead]);
    }

    if (sent > 0) {
        await query(
            `UPDATE notification_subscriptions SET last_active_at = now()
              WHERE user_id = $1 AND id <> ALL($2::uuid[])`,
            [userId, dead],
        );
    }

    return { sent, pruned: dead.length };
}
