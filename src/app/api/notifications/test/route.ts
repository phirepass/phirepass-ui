import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { TEST_EVENT, TEST_PUSH, testWebhookPayload } from '@/app/lib/notification-test';
import { pushConfigured, sendToUser } from '@/app/lib/push';
import { sendToUserWebhooks } from '@/app/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * Sends a real notification to everything this account has registered.
 *
 * This is the only thing that delivers today, and it exists to prove the whole
 * chain in one click — for push: VAPID keys, subscription, encryption, the push
 * service, the service worker's `push` handler; for webhooks: the URL, the
 * signature the receiver checks, and whatever it answers. Automatic delivery on
 * node transitions needs a detector, and the component that already knows when
 * an agent drops is the Rust server holding its WebSocket, not this app.
 *
 * Deliberately wired to the *account*, not to one destination: "send test"
 * answering only on the browser you clicked it in would not tell you whether
 * your phone is still reachable, which is the thing worth checking. One
 * endpoint at a time is a different question, and has its own route.
 *
 * `channel` narrows it when only half the page is in play. The two halves are
 * reported separately rather than summed — "3 sent" across a phone and a Slack
 * relay would hide that the relay was the one that failed.
 */
export async function POST(req: Request) {
    try {
        const user = await verifyToken();

        const body = await req.json().catch(() => ({}));
        const channel = body?.channel === 'web.push' || body?.channel === 'webhook'
            ? body.channel as 'web.push' | 'webhook'
            : 'all';

        const wantsPush = channel === 'all' || channel === 'web.push';
        const wantsWebhooks = channel === 'all' || channel === 'webhook';

        // Asking for push alone on a server with no VAPID keys is a real error;
        // the same server can still deliver webhooks, so `all` carries on and
        // reports zero sent on that half.
        if (wantsPush && !pushConfigured() && channel === 'web.push') {
            return json_response({ error: 'Push is not configured on this server' }, 503);
        }

        const [push, webhooks] = await Promise.all([
            wantsPush && pushConfigured()
                ? sendToUser(user.id, TEST_PUSH)
                : Promise.resolve({ sent: 0, pruned: 0 }),
            wantsWebhooks
                ? sendToUserWebhooks(user.id, TEST_EVENT, testWebhookPayload())
                : Promise.resolve({ sent: 0, failed: 0, skipped: 0 }),
        ]);

        return json_response({ push, webhooks }, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
