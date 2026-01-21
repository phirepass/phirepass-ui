import { cookies } from 'next/headers';
import { verifyJWT } from '@/app/lib/auth';
import { fetch_github_user } from '@/app/lib/github';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        const payload = verifyJWT(token);
        if (!payload || !payload.sub) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

        const ghToken = cookieStore.get('phirepass_token')?.value;
        if (!ghToken) return new Response(JSON.stringify({ error: 'Re-auth required' }), { status: 401 });

        // Fetch full profile from GitHub using server-side token
        const profile = await fetch_github_user(ghToken);
        return new Response(JSON.stringify(profile), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
}
