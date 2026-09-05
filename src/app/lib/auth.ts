import { cookies } from "next/headers";
import crypto from "node:crypto";
import { query } from "./db";
import { UserInfo } from "./types";

type JWTPayload = Record<string, unknown> & {
    iat: number;
    exp: number;
};

/** The signed-in session. */
export const AUTH_COOKIE = "phirepass_auth_token";

/**
 * The half-finished sign-in: OAuth is done, the second factor is not.
 *
 * A separate cookie from the session, and a token that says what it is for, so
 * the two can never be mistaken for one another. Both matter — the cookie name
 * is the browser's business and anyone can rename their own cookie, so the
 * claim below is what actually stops a challenge token being pasted into the
 * session slot to skip the code.
 */
export const MFA_CHALLENGE_COOKIE = "phirepass_mfa_challenge";

/** Long enough to find a phone, short enough that a shoulder-surfed URL is stale. */
export const MFA_CHALLENGE_TTL_SECONDS = 10 * 60;

const PURPOSE_SESSION = "session";
const PURPOSE_MFA = "mfa";

/**
 * Whether a verified payload is a full session.
 *
 * Tokens issued before `purpose` existed carry no such claim and are still
 * valid sessions, so an absent purpose passes; anything that names a different
 * one does not.
 */
function isSessionPayload(payload: JWTPayload): boolean {
    const purpose = payload.purpose;
    return purpose === undefined || purpose === PURPOSE_SESSION;
}

/** The cookie domain this deployment sets, if any. Production only. */
export function cookieDomain(): string | undefined {
    return process.env.NODE_ENV === "production"
        ? process.env.COOKIE_DOMAIN || undefined
        : undefined;
}

function base64url(input: Buffer | string) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function signHS256(data: string, secret: string) {
    return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function signJWT(
    payload: Record<string, unknown>,
    expiresInSeconds: number,
): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not set");
    }

    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JWTPayload = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds,
    } as JWTPayload;

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(fullPayload));
    const toSign = `${encodedHeader}.${encodedPayload}`;
    const signature = signHS256(toSign, secret);

    return `${toSign}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;

    const expectedSig = signHS256(`${headerB64}.${payloadB64}`, secret);
    if (
        !crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSig),
        )
    )
        return null;

    try {
        const payloadJson = Buffer.from(
            payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
            "base64",
        ).toString("utf8");
        const payload = JSON.parse(payloadJson) as JWTPayload;
        const now = Math.floor(Date.now() / 1000);
        if (typeof payload.exp !== "number" || now > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

export function hasSub(p: unknown): p is { sub: string } {
    return (
        typeof p === "object" &&
        p !== null &&
        "sub" in p &&
        typeof (p as { sub?: unknown }).sub === "string"
    );
}

export function buildAuthCookie(
    token: string,
    maxAgeSeconds: number,
    domain?: string,
) {
    const isProd = process.env.NODE_ENV === "production";
    const parts = [
        `${AUTH_COOKIE}=${token}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push("Secure");
    return parts.join("; ");
}

export function clearAuthCookie(domain?: string) {
    const isProd = process.env.NODE_ENV === "production";
    const parts = [
        `${AUTH_COOKIE}=`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=0`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push("Secure");
    return parts.join("; ");
}

export function buildCookie(
    name: string,
    value: string,
    maxAgeSeconds: number,
    domain?: string,
) {
    const isProd = process.env.NODE_ENV === "production";
    const parts = [
        `${name}=${value}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push("Secure");
    return parts.join("; ");
}

export function clearCookie(name: string, domain?: string) {
    const isProd = process.env.NODE_ENV === "production";
    const parts = [
        `${name}=`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=0`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push("Secure");
    return parts.join("; ");
}

export async function getVerifiedAuthToken(): Promise<string> {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;
    if (!token) throw new Error("Token not found");

    const payload = verifyJWT(token);
    if (!payload) throw new Error("Invalid token");

    if (!hasSub(payload)) throw new Error("Invalid token payload");
    if (!isSessionPayload(payload)) throw new Error("Invalid token payload");

    const result = await query("SELECT 1 FROM users WHERE id = $1", [
        payload.sub,
    ]);
    if (result.rowCount === 0) {
        throw new Error("User not found");
    }

    return token;
}

export async function verifyToken(): Promise<UserInfo> {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;
    if (!token) throw new Error("Token not found");

    const payload = verifyJWT(token);
    if (!payload || !hasSub(payload)) throw new Error("Invalid token payload");
    if (!isSessionPayload(payload)) throw new Error("Invalid token payload");

    const result = await query("SELECT * FROM users WHERE id = $1", [
        payload.sub,
    ]);
    if (result.rowCount === 0) {
        throw new Error("User not found");
    }

    return result.rows[0];
}

/**
 * The token that says "this browser passed OAuth as this account, and nothing
 * more". It is not a session: `verifyToken` refuses it.
 */
export function signMfaChallenge(userId: string, provider: string): string {
    return signJWT(
        { sub: userId, provider, purpose: PURPOSE_MFA },
        MFA_CHALLENGE_TTL_SECONDS,
    );
}

/** The full session issued once the second factor is in. */
export function signSession(
    userId: string,
    provider: string,
    expiresInSeconds: number,
): string {
    return signJWT({ sub: userId, provider, purpose: PURPOSE_SESSION }, expiresInSeconds);
}

export function buildMfaChallengeCookie(token: string, domain?: string) {
    return buildCookie(MFA_CHALLENGE_COOKIE, token, MFA_CHALLENGE_TTL_SECONDS, domain);
}

export function clearMfaChallengeCookie(domain?: string) {
    return clearCookie(MFA_CHALLENGE_COOKIE, domain);
}

/**
 * The account waiting on a code, or `null`.
 *
 * Deliberately narrow: it returns an id and nothing else, and it checks the
 * purpose claim before it does, so a session token in this cookie is no more
 * useful than a challenge token in the session cookie.
 */
export async function readMfaChallenge(): Promise<{ userId: string; provider: string } | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(MFA_CHALLENGE_COOKIE)?.value;
    if (!token) return null;

    const payload = verifyJWT(token);
    if (!payload || !hasSub(payload)) return null;
    if (payload.purpose !== PURPOSE_MFA) return null;

    const result = await query("SELECT 1 FROM users WHERE id = $1", [payload.sub]);
    if (result.rowCount === 0) return null;

    return {
        userId: payload.sub,
        // Carried through so the session that replaces this challenge records
        // how the person actually signed in.
        provider: typeof payload.provider === "string" ? payload.provider : "github",
    };
}
