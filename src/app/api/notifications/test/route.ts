import { verifyToken } from '@/app/lib/auth';
import { devModeGate } from '@/lib/dev-mode';
import { json_response } from '@/app/lib/framework';
import { pushConfigured, sendToUser } from '@/app/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Sends a real notification to every browser registered on this account.
 *
 * This is the only thing that pushes today, and it exists to prove the whole
 * chain — VAPID keys, subscription, encryption, the push service, the service
 * worker's `push` handler — in one click. Automatic delivery on node
 * transitions needs a detector, and the component that already knows when an
 * agent drops is the Rust server holding its WebSocket, not this app.
 *
 * Deliberately wired to the *account*, not to one device: "send test" answering
 * only on the browser you clicked it in would not tell you whether your phone
 * is still reachable, which is the thing worth checking.
 */
export async function POST(req: Request) {
    const gate = devModeGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();

        if (!pushConfigured()) {
            return json_response({ error: 'Push is not configured on this server' }, 503);
        }

        const outcome = await sendToUser(user.id, {
            title: 'Phirepass test',
            body: 'Notifications are working. This is what a node alert will look like.',
            tag: 'phirepass-test',
            url: '/dashboard/notifications',
        });

        return json_response(outcome, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
