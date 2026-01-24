import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';

export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        return json_response(user, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
