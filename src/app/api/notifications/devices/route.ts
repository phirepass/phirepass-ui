import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { devModeGate } from '@/lib/dev-mode';
import { json_response } from '@/app/lib/framework';
import { endpointHash, listSubscriptions, pushConfigured } from '@/app/lib/push';

export const dynamic = 'force-dynamic';

const PLATFORMS = new Set(['macos', 'windows', 'linux', 'ios', 'android']);

/** Trimmed to the column limits in docs/notifications-schema.sql. */
function clean(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * The browsers registered to receive notifications for the signed-in account.
 *
 * Endpoints are deliberately absent from the response. A push endpoint is a
 * capability URL, and the page has no use for anyone's but its own — which it
 * already holds. `endpoint_hash` is enough for the client to mark which row is
 * the browser it is running in.
 */
export async function GET(req: Request) {
    const gate = devModeGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();
        const rows = await listSubscriptions(user.id);

        return json_response({
            configured: pushConfigured(),
            devices: rows.map((row) => ({
                id: row.id,
                endpoint_hash: endpointHash(row.endpoint),
                label: row.label,
                platform: row.platform,
                browser: row.browser,
                created_at: row.created_at.toISOString(),
                last_active_at: row.last_active_at.toISOString(),
            })),
        }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

/**
 * Registers — or refreshes — the calling browser's subscription.
 *
 * Upsert on `endpoint` rather than insert: a browser that re-subscribes gets the
 * same endpoint back, and the keys can rotate underneath it. Without the
 * conflict clause, re-enabling notifications would either fail on the unique
 * index or quietly pile up rows for one device.
 */
export async function POST(req: Request) {
    const gate = devModeGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();

        if (!pushConfigured()) {
            return json_response({ error: 'Push is not configured on this server' }, 503);
        }

        const body = await req.json().catch(() => ({}));
        const endpoint = clean(body?.endpoint, 2048);
        const p256dh = clean(body?.keys?.p256dh, 512);
        const auth = clean(body?.keys?.auth, 512);

        if (!endpoint || !p256dh || !auth) {
            return json_response({ error: 'endpoint and keys are required' }, 400);
        }

        const platformRaw = clean(body?.platform, 32);
        const platform = platformRaw && PLATFORMS.has(platformRaw) ? platformRaw : null;

        const result = await query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, label, platform, browser)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (endpoint) DO UPDATE
                     SET user_id        = EXCLUDED.user_id,
                         p256dh         = EXCLUDED.p256dh,
                         auth           = EXCLUDED.auth,
                         label          = COALESCE(EXCLUDED.label, push_subscriptions.label),
                         platform       = COALESCE(EXCLUDED.platform, push_subscriptions.platform),
                         browser        = COALESCE(EXCLUDED.browser, push_subscriptions.browser),
                         last_active_at = now()
               RETURNING id, created_at, last_active_at`,
            [user.id, endpoint, p256dh, auth, clean(body?.label, 120), platform, clean(body?.browser, 64)],
        );

        const row = result.rows[0];

        return json_response({
            device: {
                id: row.id,
                endpoint_hash: endpointHash(endpoint),
                label: clean(body?.label, 120),
                platform,
                browser: clean(body?.browser, 64),
                created_at: row.created_at.toISOString(),
                last_active_at: row.last_active_at.toISOString(),
            },
        }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
