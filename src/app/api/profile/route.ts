import { authzErrorStatus, requireSession } from '@/app/lib/authz';
import { getOrganization } from '@/app/lib/org';
import { json_response } from '@/app/lib/framework';

/**
 * The signed-in account, plus the organisation its session is scoped to and the
 * role it holds there.
 *
 * The dashboard layout already called this to put a name in the header; it is
 * now also what backs `useCurrentRole()` (`src/lib/session.tsx`), so every
 * `can(...)` in the UI is answering from the same membership row the API
 * enforces against. One request, not two — the role arrives with the identity
 * that was going to be fetched anyway.
 */
export async function GET(req: Request) {
    try {
        const session = await requireSession();
        const org = await getOrganization(session.orgId);

        const { password: _password, ...user } = session.user;

        return json_response({ ...user, org, role: session.role }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
