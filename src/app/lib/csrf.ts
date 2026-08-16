import { cookies } from 'next/headers';
import crypto from 'node:crypto';

/**
 * Double-submit CSRF protection for the support form.
 *
 * Opening the dialog calls `GET /api/contact`, which mints a random token,
 * returns it in the body, and sets the same value in a cookie. The POST carries
 * the body copy, and the route only proceeds when the two match.
 *
 * The cookie stays `HttpOnly`: a page on another origin can make the browser
 * send it, but cannot read it, so it cannot put the matching value in a request
 * body. That is the whole of the protection — a forged cross-origin POST has
 * the cookie and not the token.
 *
 * `SameSite=Strict` is a second, independent lock: this cookie is never wanted
 * on a cross-site request, and no flow navigates into `/api/contact` from
 * elsewhere.
 */

export const CSRF_COOKIE = 'phirepass_contact_csrf';

/** Long enough to write a support message, short enough to be worth expiring. */
const TTL_SECONDS = 30 * 60;

function cookieDomain(): string | undefined {
    return process.env.NODE_ENV === 'production'
        ? process.env.COOKIE_DOMAIN || undefined
        : undefined;
}

/**
 * The token for this visit, minting one only when the browser does not already
 * hold a cookie.
 *
 * Idempotent on purpose: React's strict mode double-invokes the effect that
 * asks for a token, and two mints in flight at once would race — the cookie
 * that lands last need not be the token the form kept. Reusing the existing
 * value makes any number of concurrent calls agree. `cookie` is `null` when
 * there is nothing new to set.
 */
export async function getOrIssueCsrfToken(): Promise<{ token: string; cookie: string | null }> {
    const cookieStore = await cookies();
    const existing = cookieStore.get(CSRF_COOKIE)?.value;
    if (existing) {
        return { token: existing, cookie: null };
    }

    return issueCsrfToken();
}

/** A fresh token and the `Set-Cookie` value that pairs with it. */
export function issueCsrfToken(): { token: string; cookie: string } {
    const token = crypto.randomBytes(32).toString('base64url');

    const parts = [
        `${CSRF_COOKIE}=${token}`,
        // Scoped to the one endpoint that uses it, so it rides along with
        // nothing else the browser sends.
        'Path=/api/contact',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${TTL_SECONDS}`,
    ];

    const domain = cookieDomain();
    if (domain) parts.push(`Domain=${domain}`);
    if (process.env.NODE_ENV === 'production') parts.push('Secure');

    return { token, cookie: parts.join('; ') };
}

/**
 * Whether the submitted token matches the one in the cookie.
 *
 * Compared as digests so the timing-safe comparison gets two equal-length
 * buffers whatever was submitted, and neither the length nor the prefix of the
 * real token leaks through a failed attempt.
 */
export async function verifyCsrfToken(submitted: unknown): Promise<boolean> {
    if (typeof submitted !== 'string' || submitted.length === 0) {
        return false;
    }

    const cookieStore = await cookies();
    const expected = cookieStore.get(CSRF_COOKIE)?.value;
    if (!expected) return false;

    const a = crypto.createHash('sha256').update(expected).digest();
    const b = crypto.createHash('sha256').update(submitted).digest();

    return crypto.timingSafeEqual(a, b);
}
