import { json_response } from '@/app/lib/framework';
import {
    authzErrorStatus,
    nodeManageScope,
    nodeScope,
    requireSession,
    scopeAt,
    type Session,
} from '@/app/lib/authz';
import { LIVE_SHARE } from '@/app/lib/scope';
import { getRedisClient } from '@/app/lib/redis';
import { query } from '@/app/lib/db';
import { unionShareServices, type ShareableService } from '@/app/lib/share-services';

type NodeSettings = Record<string, unknown>;

type ServiceDetail = {
    id: string;
    name: string | null;
    kind: string;
    host: string;
    port: number;
    username: string | null;
    password: string | null;
    scheme: 'http' | 'https' | null;
};

/**
 * What somebody who may *use* a node — but not configure it — is told about its
 * services.
 *
 * Enough to pick one from a list and open a session against it, and nothing
 * else. `host` and `port` go too, not only the password: they describe the
 * inside of somebody else's machine, and nothing on the use path needs them —
 * the tunnel is opened by service id and the agent dials its own configured
 * address.
 */
type ServiceSummary = Pick<ServiceDetail, 'id' | 'name' | 'kind'>;

function toSummary(service: ServiceDetail): ServiceSummary {
    return { id: service.id, name: service.name, kind: service.kind };
}

/**
 * Which service kinds a share opens for this session, or `null` for "every one".
 *
 * The dashboard's copy of `ServiceSet` in `phirepass-rs/server/src/access.rs`,
 * and it follows the same two rules, because a picker that offers a session the
 * server will refuse is worse than one that never offered it:
 *
 * - **An empty `services` array means every service**, including ones added to
 *   the node later. It is not the same as naming none.
 * - **Two live shares union.** An organisation-wide share and one naming this
 *   person can both exist, and being named in a second share must never take
 *   away what the first gave.
 *
 * Only called for a session that reached the node *through* a share. Somebody
 * who owns it, or administers the organisation that does, is never narrowed —
 * see `Reach::Direct`, which is the same distinction on the server.
 */
async function sharedServiceKinds(
    session: Session,
    nodeId: string,
): Promise<ReadonlySet<ShareableService> | null> {
    const result = await query(
        `SELECT s.services
           FROM node_shares s
          WHERE s.node_id = $1
            AND s.org_id = $2
            AND ${LIVE_SHARE}
            AND (s.audience = 'org' OR s.grantee_id = $3)`,
        [nodeId, session.orgId, session.userId],
    );

    return unionShareServices(result.rows as { services: string[] | null }[]);
}


function normalizeSettings(value: unknown): NodeSettings {
    if (!value) {
        return {};
    }

    if (typeof value === 'string') {
        try {
            return normalizeSettings(JSON.parse(value));
        } catch {
            return {};
        }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as NodeSettings;
    }

    return {};
}

function normalizeServiceKind(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function toServiceDetail(entry: unknown): ServiceDetail | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const raw = entry as Record<string, unknown>;
    const kind = normalizeServiceKind(raw.kind);
    if (!kind) {
        return null;
    }

    const id = typeof raw.id === 'string' ? raw.id : null;
    if (!id) {
        return null;
    }

    return {
        id,
        name: typeof raw.name === 'string' ? raw.name : null,
        kind,
        host: typeof raw.host === 'string' ? raw.host : '',
        port: typeof raw.port === 'number' ? raw.port : 0,
        username: typeof raw.username === 'string' ? raw.username : null,
        password: typeof raw.password === 'string' ? raw.password : null,
        scheme: raw.scheme === 'https' ? 'https' : raw.scheme === 'http' ? 'http' : null,
    };
}

function extractServices(value: unknown): ServiceDetail[] {
    const entries = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.values(value as Record<string, unknown>)
            : [];

    return entries
        .map(toServiceDetail)
        .filter((service): service is ServiceDetail => service !== null);
}

// The agent's live heartbeat payload carries its currently configured services,
// including the ids actually registered with the connected agent. This is the
// source of truth whenever the node is online — Postgres can lag behind (e.g.
// stale ids from a previous run) and a stale id makes OpenTunnel a silent no-op
// since the agent won't recognize it.
// `ownerId`, not "the caller": the Redis key is namespaced under whoever
// enrolled the node, which after organisations is not necessarily the person
// asking.
async function fetchLiveServices(ownerId: string, nodeId: string): Promise<unknown> {
    const redis = await getRedisClient();
    if (!redis) {
        return null;
    }

    try {
        const key = `phirepass:users:${ownerId}:nodes:${nodeId}`;
        const fields = await redis.hGetAll(key);
        if (!fields || Object.keys(fields).length === 0) {
            return null;
        }

        // The server stores the node record (not the heartbeat stats) under the
        // "node" hash field; that's where `settings.services` actually lives.
        const node = JSON.parse(fields.node) as { settings?: { services?: unknown } };
        return node?.settings?.services ?? null;
    } catch {
        return null;
    }
}

/**
 * A node's services — in full for whoever may configure it, and as a bare list
 * for whoever may only use it.
 *
 * **This route answers two different questions and used to refuse one of them.**
 * It fills the edit dialogs, which need `host`, `port`, `username` and
 * `password`; and it fills the service picker that opening an SSH, SFTP, HTTP or
 * RDP session goes through, which needs an id and a name. It was scoped to
 * `nodeManageScope` for the first, so the second returned **404 to every
 * grantee** — sharing a node let somebody see it in their list and then refused
 * to tell them what they could open on it. The share worked; there was no way to
 * reach it.
 *
 * The fix is not to relax the scope. Service credentials are still stored in
 * plaintext in `nodes.settings` (`phirepass-rs/PLAN.md` P01), so handing a
 * grantee this response whole would hand them the passwords for what runs on
 * somebody else's machine — which is precisely the line `SHARING.md` draws
 * between *using* a node and *configuring* it, and the reason `may_configure`
 * on the server takes no share argument at all.
 *
 * So the **scope decides visibility and the shape decides detail**: reachable at
 * all is `nodeScope` (which admits shares), and everything sensitive is gated on
 * `nodeManageScope` separately. A grantee gets `id`, `name` and `kind`, narrowed
 * to the services their share actually opens. Nobody who could not read a
 * credential before can read one now.
 */
export async function GET(req: Request) {
    try {
        const session = await requireSession();
        const url = new URL(req.url);
        const nodeId = url.searchParams.get('id');
        const requestedKind = normalizeServiceKind(url.searchParams.get('kind'));

        if (!nodeId) {
            return json_response({ error: 'Node id is required' }, 400);
        }

        // Visibility first, and this is the read scope: a node somebody was
        // given is a node they can open a session against, so it has to resolve
        // here or the picker has nothing to show.
        const readable = scopeAt(nodeScope(session, 'n'), 1);

        const result = await query(
            `SELECT n.settings, n.user_id FROM nodes n WHERE n.id = $1 AND ${readable.sql}`,
            [nodeId, ...readable.params]
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }

        // Detail second, asked separately rather than folded into the query
        // above, because the two answers are genuinely different: one decides
        // whether the node exists for this caller, the other whether they may be
        // handed its credentials.
        const manageable = scopeAt(nodeManageScope(session, 'n'), 1);
        const manageResult = await query(
            `SELECT 1 FROM nodes n WHERE n.id = $1 AND ${manageable.sql}`,
            [nodeId, ...manageable.params]
        );
        const canManage = (manageResult.rowCount ?? 0) > 0;

        const ownerId = (result.rows[0] as { user_id: string }).user_id;
        const liveServices = await fetchLiveServices(ownerId, nodeId);
        let services = extractServices(liveServices);

        if (services.length === 0) {
            const settings = normalizeSettings(result.rows[0].settings);
            services = extractServices(settings.services);
        }

        if (requestedKind) {
            services = services.filter((service) => service.kind === requestedKind);
        }

        if (canManage) {
            return json_response({ services, can_manage: true }, 200);
        }

        // Narrowed to what the share opens, so the picker never offers a session
        // the server would refuse on the next frame.
        const permitted = await sharedServiceKinds(session, nodeId);
        const visible = permitted === null
            ? services
            : services.filter((service) => permitted.has(service.kind as ShareableService));

        // `can_manage` is on the response so the client can tell "withheld" from
        // "there are none", which are different things to say to a person.
        return json_response({ services: visible.map(toSummary), can_manage: false }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
