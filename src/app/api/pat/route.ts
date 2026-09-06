import { authzErrorStatus, requireSession } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { create_pat } from '@/app/lib/pat';
import { nanoid } from 'nanoid'

export async function GET(req: Request) {
    try {
        const session = await requireSession();
        return json_response({ user: session.user }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

export async function POST(req: Request) {
    try {
        const session = await requireSession();
        const body = await req.json().catch(() => ({}));

        const token = await create_pat({
            name: body.name || `PAT #${nanoid()}`,
            user_id: session.userId,
            org_id: session.orgId,
            scopes: ['server:register'],
            expires_at: body.expires_at || null,
        });

        return json_response({ token }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        const { status, body: errorBody } = authzErrorStatus(e);
        return json_response(errorBody, status);
    }
}
