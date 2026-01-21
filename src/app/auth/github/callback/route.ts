import { query } from '@/app/lib/db';
import { fetch_github_token, fetch_github_user } from '@/app/lib/github';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
        return new Response('Missing authorization code', { status: 400 });
    }

    try {
        const accessToken = await fetch_github_token(code, state);

        const userInfo = await fetch_github_user(accessToken);

        const requestUrl = new URL(request.url);
        const dashboardUrl = new URL('/dashboard', requestUrl.origin);
        dashboardUrl.searchParams.set('user', JSON.stringify(userInfo));

        return Response.redirect(dashboardUrl.toString());
    } catch (error) {
        console.error('OAuth error:', error);
        return new Response('Authentication failed', { status: 500 });
    }
}
