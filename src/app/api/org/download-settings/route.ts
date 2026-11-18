import { json_response } from '@/app/lib/framework';
import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { query } from '@/app/lib/db';
import {
    GET_ORG_SETTINGS_SQL,
    SET_ORG_SETTINGS_SQL,
    parseOrgSettings,
    readOrgSettings,
} from '@/app/lib/org-download-settings';

/**
 * Organisation → Downloads (T1.21): keep_days and stream_link_hours for the
 * current organisation. Owners and admins only, as the per-node policy is.
 * Nothing here reaches a node: retention runs in Postgres and the link
 * lifetime is read by the server when it issues one.
 */
export async function GET(req: Request) {
    try {
        const session = await requirePermission('nodes:manage:all');
        try {
            const result = await query(GET_ORG_SETTINGS_SQL, [session.orgId]);
            return json_response({ settings: readOrgSettings(result.rows[0]?.settings), available: true }, 200);
        } catch (error) {
            console.warn('[org-download-settings] unavailable:', error);
            return json_response({ settings: readOrgSettings(null), available: false }, 200);
        }
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

export async function PUT(req: Request) {
    try {
        const session = await requirePermission('nodes:manage:all');
        const parsed = parseOrgSettings(await req.json().catch(() => null));
        if ('error' in parsed) return json_response({ error: parsed.error, field: parsed.field }, 400);
        const result = await query(SET_ORG_SETTINGS_SQL, [session.orgId, JSON.stringify(parsed.ok), session.userId]);
        return json_response({ settings: readOrgSettings(result.rows[0]?.settings) }, 200);
    } catch (e) {
        console.warn(`[server][put][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
