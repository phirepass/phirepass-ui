import { getVerifiedAuthToken } from "@/app/lib/auth";
import { authzErrorStatus, requireSession } from "@/app/lib/authz";
import { json_response } from "@/app/lib/framework";

/**
 * The token a browser presents to `phirepass-rs` when it opens a session to an
 * agent.
 *
 * It is the session cookie's own JWT, handed out deliberately: the Rust server
 * verifies it with the same `JWT_SECRET` and reads `sub` from it, and minting a
 * second short-lived token here would mean a reconnect after a dropped socket
 * failing on an expiry the widget cannot see.
 *
 * What changed with organisations is the check in front of it. It now goes
 * through `requireSession`, so a **suspended member cannot obtain one** — which
 * matters more here than on any other route, because this is the credential that
 * opens an SSH session. Suspension is read from Postgres on every call, so it
 * takes effect on the next connection rather than when a seven-day cookie
 * happens to expire.
 *
 * The token deliberately carries **no organisation or role claim**, which is a
 * departure from `ROADMAP.md` A103. A claim minted here is a snapshot: a role
 * changed or a membership withdrawn a minute later would still be honoured by
 * whatever holds the token. The server resolves access from Postgres instead
 * (`resolve_node_access`, `server/src/node_access.rs`) — one query it was
 * already making at WebSocket auth, and no window in which a stale claim is
 * believed.
 */
export async function GET(req: Request) {
    try {
        await requireSession();
        const token = await getVerifiedAuthToken();
        return json_response({ token }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
