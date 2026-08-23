import { verifyToken } from '@/app/lib/auth';
import { devModeGate } from '@/lib/dev-mode';
import { json_response } from '@/app/lib/framework';
import { TEST_EVENT, testWebhookPayload } from '@/app/lib/notification-test';
import { sendToWebhook } from '@/app/lib/webhooks';

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

/**
 * Sends one test delivery to one endpoint and reports what it answered.
 *
 * Per-endpoint rather than account-wide, unlike the push test: a webhook is
 * something you are *wiring up*, and the question being asked is "did this URL
 * accept it", which an aggregate count cannot answer. Disabled endpoints are
 * tested too — see `sendToWebhook`.
 *
 * The answer is 200 whatever the receiver said. A 502 from us for a 500 from
 * them would be a lie about which hop failed; the status and the error are in
 * the body, and the endpoint's row now carries them too.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const gate = devModeGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();
        const { id } = await ctx.params;

        if (!UUID.test(id)) {
            return json_response({ error: 'Not found' }, 404);
        }

        const delivery = await sendToWebhook(user.id, id, TEST_EVENT, testWebhookPayload());

        if (!delivery) {
            return json_response({ error: 'Not found' }, 404);
        }

        return json_response(delivery, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
