import { UserInfo } from "./types";

export async function fetch_github_token(code: string, state: string | null) {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
            state,
        }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
        throw Error(`Authentication failed: ${tokenData.error}`);
    }

    return tokenData.access_token;
}

export async function fetch_github_user(accessToken: string): Promise<UserInfo> {
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
    };

    const profileResponse = await fetch('https://api.github.com/user', { headers });

    if (!profileResponse.ok) {
        throw new Error('Failed to fetch GitHub user profile');
    }

    const profileData = await profileResponse.json();

    const emailResponse = await fetch('https://api.github.com/user/emails', { headers });

    if (!emailResponse.ok) {
        throw new Error('Failed to fetch GitHub user email(s)');
    }

    const emails = await emailResponse.json();
    const primaryEmail = emails.find((e: { primary: boolean }) => e.primary)?.email || profileData.email || emails[0]?.email;

    const userInfo = {
        id: String(profileData.id),
        username: profileData.login,
        email: primaryEmail,
        avatar_url: profileData.avatar_url,
        accessToken,
    };

    return userInfo;
}
