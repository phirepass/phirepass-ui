import { query } from "@/app/lib/db";
import { fetch_github_token, fetch_github_user } from "@/app/lib/github";
import { signJWT, buildAuthCookie, buildCookie } from "@/app/lib/auth";
import { UserInfo } from "@/app/lib/types";
import { empty_response, json_response } from "@/app/lib/framework";

async function get_user_by_email(email: string) {
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (!result) {
        throw new Error("Database query failed");
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
        userInfo.avatar_url,
    ];

    const result = await query(insertQuery, values);
    if (!result) {
        throw new Error("Failed to create user in the database");
    }

    return result.rows[0];
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    console.log('================================================'); // Debug separator
    console.log('Request url:', req.url); // Debug log
    console.log('Request headers:', JSON.stringify(Object.fromEntries(req.headers.entries()))); // Debug log
    console.log('Received GitHub callback with code:', code); // Debug log
    console.log('Received GitHub callback with state:', state); // Debug log
    console.log('================================================'); // Debug separator

    try {
        const accessToken = await fetch_github_token(code, state);
        console.log('Fetched GitHub access token:', accessToken); // Debug log
        const userInfo = await fetch_github_user(accessToken);
        console.log('Fetched GitHub user info:', userInfo); // Debug log
        let existingUser = await get_user_by_email(userInfo.email);
        console.log('Existing user:', existingUser); // Debug log
        if (!existingUser) {
            console.log('Creating new GitHub user:', userInfo); // Debug log
            await create_github_user(userInfo);
            console.log('New GitHub user created:', userInfo); // Debug log
            existingUser = await get_user_by_email(userInfo.email);
            console.log('Fetched newly created user:', existingUser); // Debug log
        }

        // Issue session token with minimal info only
        const payload = {
            sub: existingUser?.id,
            provider: "github",
        };

        // 7 days
        const maxAge = 7 * 24 * 60 * 60;
        const token = signJWT(payload, maxAge);

        const requestUrl = new URL(req.url);
        console.log('Redirecting to dashboard url:', requestUrl.toString()); // Debug log
        const dashboardUrl = new URL("/dashboard", requestUrl.origin);
        console.log('Redirecting to dashboard at:', dashboardUrl.toString()); // Debug log

        // Also set a short-lived GitHub token cookie for server-side profile fetches
        const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g., example.com
        const authCookie = buildAuthCookie(token, maxAge, cookieDomain);
        const ghCookie = buildCookie(
            "phirepass_token",
            accessToken,
            24 * 60 * 60,
            cookieDomain,
        ); // 1 day

        const headers = new Headers();
        headers.set("Location", dashboardUrl.toString());
        headers.append("Set-Cookie", authCookie);
        // headers.append("Set-Cookie", ghCookie);

        return empty_response(302, headers);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: "Authentication failed" }, 500);
    }
}
