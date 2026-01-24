import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { create_pat } from '@/app/lib/pat';

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

        const token = await create_pat({
            name: `PAT for ${user.username}`,
            user_id: user.id,
            scopes: ['read', 'write'],
            expires_at: null, // nevel
        });

        return json_response({ token }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
