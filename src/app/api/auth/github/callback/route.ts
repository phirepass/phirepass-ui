export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    try {
        // Verify state (optional but recommended)
        // In a real app, verify that state matches what was stored

        // Exchange code for access token
        const tokenResponse = await fetch(
            "https://github.com/login/oauth/access_token",
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code,
                    state,
                }),
            }
        );

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return new Response(`Authentication failed: ${tokenData.error}`, {
                status: 401,
            });
        }

        const accessToken = tokenData.access_token;

        // Fetch user information
        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        const userData = await userResponse.json();

        // Fetch user email
        const emailResponse = await fetch(
            "https://api.github.com/user/emails",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                },
            }
        );

        const emails = await emailResponse.json();
        const primaryEmail =
            emails.find((e: { primary: boolean; email: string }) => e.primary)
                ?.email ||
            userData.email ||
            emails[0]?.email;

        // Prepare user data to be stored
        const userInfo = {
            id: userData.id,
            login: userData.login,
            name: userData.name || userData.login,
            email: primaryEmail,
            avatar_url: userData.avatar_url,
            accessToken,
        };

        // Redirect to dashboard with user data encoded in URL
        const requestUrl = new URL(request.url);
        const dashboardUrl = new URL("/dashboard", requestUrl.origin);
        dashboardUrl.searchParams.set("user", JSON.stringify(userInfo));

        return Response.redirect(dashboardUrl.toString());
    } catch (error) {
        console.error("OAuth error:", error);
        return new Response("Authentication failed", { status: 500 });
    }
}
