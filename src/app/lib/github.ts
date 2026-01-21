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

export async function fetch_github_user(accessToken: string) {
    const userResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
        },
    });

    if (!userResponse.ok) {
        throw new Error('Failed to fetch GitHub user');
    }

    const userData = await userResponse.json();

    const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
        },
    });

    if (!emailResponse.ok) {
        throw new Error('Failed to fetch GitHub user email(s)');
    }

    const emails = await emailResponse.json();
    const primaryEmail = emails.find((e: { primary: boolean }) => e.primary)?.email || userData.email || emails[0]?.email;

    // Prepare user data to be stored
    const userInfo = {
        id: userData.id,
        login: userData.login,
        name: userData.name || userData.login,
        email: primaryEmail,
        avatar_url: userData.avatar_url,
        accessToken,
    };

    return userInfo;
}
