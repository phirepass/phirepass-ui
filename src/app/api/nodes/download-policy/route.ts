import { json_response } from '@/app/lib/framework';
import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { query } from '@/app/lib/db';
import { LIST_POLICIES_SQL, SET_POLICY_SQL, forbiddenKinds, parsePolicy } from '@/app/lib/download-policy';

/**
 * Organisation → Downloads (screen L1): which of the organisation's nodes may
 * download. Owners and admins only (`nodes:manage:all`), on both verbs; a
 * member who owns a node cannot lift a block on it.
 *
 * The server enforces what is stored here (`server/src/fetch/policy.rs`) and
 * stops running downloads it no longer allows within one access sweep.
 */
export async function GET(req: Request) {
    try {
        const session = await requirePermission('nodes:manage:all');
        try {
            const result = await query(LIST_POLICIES_SQL, [session.orgId]);
            return json_response({ nodes: result.rows, available: true }, 200);
        } catch (error) {
            // A database the dashboard has not migrated yet.
            console.warn('[download-policy] list unavailable:', error);
            return json_response({ nodes: [], available: false }, 200);
        }
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

/**
 * `{ node_id, policy }`. Sets the policy and, in the same statement, turns
 * off the switches it forbids. 404 for a node outside this organisation,
 * so another organisation's node ids are not confirmed.
 */
export async function PUT(req: Request) {
    try {
        const session = await requirePermission('nodes:manage:all');
        const body = await req.json().catch(() => null) as { node_id?: unknown; policy?: unknown } | null;
        const nodeId = typeof body?.node_id === 'string' ? body.node_id : null;
        const policy = parsePolicy(body?.policy);
        if (!nodeId || !/^[0-9a-f-]{36}$/i.test(nodeId)) {
            return json_response({ error: 'node_id is required' }, 400);
        }
        if (!policy) {
            return json_response({ error: 'policy must be allowed, links_only or blocked' }, 400);
        }

        const result = await query(SET_POLICY_SQL, [nodeId, session.orgId, policy, session.userId, forbiddenKinds(policy)]);
        const { saved, stripped } = result.rows[0] as { saved: number; stripped: number };
        if (saved === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }
        return json_response({ node_id: nodeId, policy, switches_removed: stripped }, 200);
    } catch (e) {
        console.warn(`[server][put][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
