import { query } from '@/app/lib/db';
import { fetch_github_token, fetch_github_user } from '@/app/lib/github';
import { UserInfo } from '@/app/lib/types';

async function get_user_by_email(email: string) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (!result) {
        throw new Error('Database query failed');
    }

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

async function create_github_user(userInfo: UserInfo) {
    const insertQuery = `
        INSERT INTO users (provider, email, username, avatar_url)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;

    const values = [
        "github",
        userInfo.email,
        userInfo.username,
        userInfo.avatar_url
    ];

    const result = await query(insertQuery, values);
    if (!result) {
        throw new Error('Failed to create user in the database');
    }

    return result.rows[0];
}

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
        let existingUser = await get_user_by_email(userInfo.email);
        if (!existingUser) {
            await create_github_user(userInfo);
            existingUser = await get_user_by_email(userInfo.email);
        }

        const requestUrl = new URL(request.url);
        const dashboardUrl = new URL('/dashboard', requestUrl.origin);
        dashboardUrl.searchParams.set('user', JSON.stringify(userInfo));

        return Response.redirect(dashboardUrl.toString());
    } catch (error) {
        console.error('OAuth error:', error);
        return new Response('Authentication failed', { status: 500 });
    }
}
