/**
 * The two cookies that carry an invitation across a sign-in, and the path it
 * lands on.
 *
 * Kept apart from `invitation-email.ts` because three server routes and one
 * browser component all need a piece of this, and none of them wants the mailer
 * pulled in behind it. Nothing here touches the database or `node:crypto`, so
 * the client component can import the cookie name from the same place the route
 * writes it and the two cannot drift.
 */

/** Where an invitation link points. Every path through it ends in the dashboard. */
export function invitePath(token: string): string {
    return `/invite/${encodeURIComponent(token)}`;
}

/**
 * The token, held while the reader goes and signs in.
 *
 * HttpOnly: it is the credential half of the link, and the browser has no
 * business reading it back. Fifteen minutes is an OAuth round trip with room
 * for a password manager, and no more — a stale one silently does nothing.
 */
export const PENDING_INVITATION_COOKIE = 'phirepass_invitation';
export const PENDING_TTL_SECONDS = 15 * 60;

/**
 * What the dashboard says on arrival: an outcome word, optionally `:` and the
 * workspace name.
 *
 * Deliberately readable by scripts — `InvitationNotice` reads it and deletes
 * it. It carries no credential, and nothing the reader is not about to see in
 * the header anyway.
 *
 * Host-only, unlike the other two: a cookie written with `Domain` cannot be
 * deleted by a browser that does not know what that domain was, and this one is
 * deleted from the client the moment it has been read. It only ever has to
 * survive one same-host redirect.
 */
export const INVITATION_NOTICE_COOKIE = 'phirepass_invitation_notice';

function attributes(httpOnly: boolean, maxAge: number, domain?: string): string[] {
    const parts = [`Path=/`, `SameSite=Lax`, `Max-Age=${maxAge}`];
    if (httpOnly) parts.splice(1, 0, 'HttpOnly');
    if (domain) parts.push(`Domain=${domain}`);
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    return parts;
}

export function buildPendingCookie(token: string, domain?: string): string {
    return [`${PENDING_INVITATION_COOKIE}=${encodeURIComponent(token)}`, ...attributes(true, PENDING_TTL_SECONDS, domain)].join('; ');
}

export function clearPendingCookie(domain?: string): string {
    return [`${PENDING_INVITATION_COOKIE}=`, ...attributes(true, 0, domain)].join('; ');
}

export function buildNoticeCookie(value: string): string {
    return [`${INVITATION_NOTICE_COOKIE}=${encodeURIComponent(value)}`, ...attributes(false, 120)].join('; ');
}

/**
 * One cookie out of a `Cookie` header.
 *
 * The routes that need this are reading a request they were handed rather than
 * the ambient store, so `next/headers` would be the wrong tool: the OAuth
 * callback wants the cookie that came in with *this* redirect.
 */
export function readCookie(header: string | null, name: string): string | null {
    if (!header) return null;

    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() !== name) continue;

        try {
            return decodeURIComponent(part.slice(eq + 1).trim()) || null;
        } catch {
            return null;
        }
    }

    return null;
}

/** The cookie domain the rest of the app writes its cookies under. */
export function invitationCookieDomain(): string | undefined {
    return process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN || undefined : undefined;
}
