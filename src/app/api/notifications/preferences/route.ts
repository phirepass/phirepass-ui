import { verifyToken } from '@/app/lib/auth';
import { devModeGate } from '@/lib/dev-mode';
import { json_response } from '@/app/lib/framework';
import { getPreferences, savePreferences } from '@/app/lib/notification-preferences';

export const dynamic = 'force-dynamic';

/** The resolved set — every event in the catalogue has an answer. */
export async function GET(req: Request) {
    const gate = devModeGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();
        return json_response({ preferences: await getPreferences(user.id) }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

/**
 * Replaces the set wholesale.
 *
 * PUT rather than PATCH because the client always holds the complete resolved
 * state — it renders every switch — so sending a delta would be inventing a
 * harder contract for no benefit.
 */
export async function PUT(req: Request) {
    const gate = devModeGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();
        const body = await req.json().catch(() => ({}));
        const incoming = body?.preferences;

        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
            return json_response({ error: 'preferences must be an object' }, 400);
        }

        return json_response(
            { preferences: await savePreferences(user.id, incoming as Record<string, unknown>) },
            200,
        );
    } catch (e) {
        console.warn(`[server][put][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
