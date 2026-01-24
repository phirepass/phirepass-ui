import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { create_pat } from '@/app/lib/pat';
import { nanoid } from 'nanoid'

export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        return json_response({ user }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}

export async function POST(req: Request) {
    try {
        const user = await verifyToken();
        const body = await req.json().catch(() => ({}));

        const token = await create_pat({
            name: body.name || `PAT #${nanoid()}`,
            user_id: user.id,
            scopes: body.scopes || ['read', 'write'],
            expires_at: body.expires_at || null,
        });

        return json_response({ token }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
