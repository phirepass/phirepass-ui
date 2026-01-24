import { cookies } from 'next/headers';
import { verifyJWT } from '@/app/lib/auth';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        if (!token) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const payload = verifyJWT(token);
        if (!payload) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { email, name, username, avatar_url, sub, provider } = payload as any;
        return new Response(
            JSON.stringify({ id: sub, email, name, username, avatar_url, provider }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
}
