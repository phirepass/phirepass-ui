import { query } from "@/app/lib/db";
import { fetch_github_token, fetch_github_user } from "@/app/lib/github";
import {
    buildAuthCookie,
    buildCookie,
    buildMfaChallengeCookie,
    clearAuthCookie,
    signMfaChallenge,
    signSession,
} from "@/app/lib/auth";
import { isMfaEnabled } from "@/app/lib/mfa";
import { IS_MFA_ENABLED } from "@/lib/mfa-feature";
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

function get_effective_request_url(req: Request): URL {
    const requestUrl = new URL(req.url);

    const forwardedHostHeader = req.headers.get("x-forwarded-host") || requestUrl.host;
    const forwardedPortHeader = req.headers.get("x-forwarded-port") || requestUrl.port;
    const forwardedProtHeader = req.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");

    const forwardedHost = forwardedHostHeader
        ?.split(",")[0]
        .trim();
    const forwardedPort = forwardedPortHeader
        ?.split(",")[0]
        .trim();
    const forwardedProt = forwardedProtHeader
        ?.split(",")[0]
        .trim()
        .replace(/:$/, "")
        .toLowerCase();

    if (forwardedHost) {
        requestUrl.host = forwardedHost;
    }

    if (forwardedPort && !forwardedHost?.includes(":")) {
        requestUrl.port = forwardedPort;
    }

    if (forwardedProt === "http" || forwardedProt === "https") {
        requestUrl.protocol = `${forwardedProt}:`;
    }

    return requestUrl;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    try {
        const accessToken = await fetch_github_token(code, state);
        const userInfo = await fetch_github_user(accessToken);
        let existingUser = await get_user_by_email(userInfo.email);
        if (!existingUser) {
            await create_github_user(userInfo);
            existingUser = await get_user_by_email(userInfo.email);
        }

        // The insert above returns the row, but it is read back through the same
        // lookup the sign-in path uses so that both branches below work with an
        // account that is genuinely there to be queried.
        if (!existingUser) {
            throw new Error("User could not be created");
        }

        const requestUrl = get_effective_request_url(req);

        // Also set a short-lived GitHub token cookie for server-side profile fetches
        const cookieDomain =
            process.env.NODE_ENV === "production"
                ? process.env.COOKIE_DOMAIN || undefined
                : undefined;
        const ghCookie = buildCookie(
            "phirepass_token",
            accessToken,
            24 * 60 * 60,
            cookieDomain,
        ); // 1 day

        /**
         * GitHub has said who this is; two-factor decides whether that is
         * enough. When it is on, what gets set here is a challenge token, not a
         * session — the session is minted by /api/auth/mfa/challenge once a code
         * has been read off the authenticator.
         *
         * Any existing session is cleared at the same time. Someone re-running
         * the sign-in flow on an account with 2FA should end up at the code
         * prompt, not silently back in the dashboard on the old cookie.
         *
         * The deployment flag is tested first, so an install with 2FA off does
         * not pay for a lookup on every sign-in — and an account that enrolled
         * somewhere the feature is on is simply not challenged here rather than
         * being locked out of an install that cannot ask.
         */
        if (IS_MFA_ENABLED && (await isMfaEnabled(existingUser.id))) {
            const challenge = signMfaChallenge(existingUser.id, "github");
            const verifyUrl = new URL("/login/verify", requestUrl.origin);

            const headers = new Headers();
            headers.set("Location", verifyUrl.toString());
            headers.append("Set-Cookie", clearAuthCookie(cookieDomain));
            headers.append("Set-Cookie", buildMfaChallengeCookie(challenge, cookieDomain));

            return empty_response(302, headers);
        }

        // 7 days
        const maxAge = 7 * 24 * 60 * 60;
        const token = signSession(existingUser.id, "github", maxAge);

        const dashboardUrl = new URL("/dashboard/nodes", requestUrl.origin);
        const authCookie = buildAuthCookie(token, maxAge, cookieDomain);

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
