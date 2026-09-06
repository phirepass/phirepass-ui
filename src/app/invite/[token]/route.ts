import { verifyToken } from '@/app/lib/auth';
import { acceptInvitation, type AcceptOutcome } from '@/app/lib/org';
import { empty_response } from '@/app/lib/framework';
import {
    buildNoticeCookie,
    buildPendingCookie,
    clearPendingCookie,
    invitationCookieDomain,
} from '@/app/lib/invitation-link';

export const dynamic = 'force-dynamic';

/**
 * Where the link in an invitation email goes.
 *
 * It used to go to `/login?invitation=<token>`, and the token was read by
 * nothing: an already-signed-in reader was redirected to the dashboard before
 * anything looked at it, and a signed-out one landed in whichever workspace
 * `readMembership` picked rather than the one they had just been invited to.
 * Both produced the same complaint — accepting an invitation changed nothing on
 * screen.
 *
 * So this is a redirect, never a page. Every path through it ends inside the
 * dashboard; what differs is the notice waiting there. A signed-out reader is
 * sent to sign in with the token parked in a cookie, and the OAuth callback
 * sends them back here to be landed properly.
 *
 * Relative `Location` throughout. The deployment sits behind Traefik and at
 * least one proxy hop, and a host reassembled from forwarded headers is one more
 * thing that can be wrong on a link somebody only gets once.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
    const { token } = await ctx.params;
    const domain = invitationCookieDomain();

    let userId: string;
    let email: string;

    try {
        const user = await verifyToken();
        userId = user.id;
        email = user.email;
    } catch {
        // Not signed in, which is the ordinary case: the invited address usually
        // has no account yet.
        const headers = new Headers({ Location: '/login' });
        headers.append('Set-Cookie', buildPendingCookie(token, domain));

        return empty_response(302, headers);
    }

    let outcome: AcceptOutcome;
    let orgName: string | null = null;

    try {
        const result = await acceptInvitation(userId, email, token);
        outcome = result.outcome;
        orgName = result.org?.name ?? null;
    } catch (e) {
        // An outage here must not strand somebody on a URL they have no reason
        // to retry. They are signed in, the dashboard is the right place to be,
        // and the invitation is untouched for the next attempt.
        console.warn(`[server][get][${req.url}]`, e);
        outcome = 'unknown';
    }

    const headers = new Headers({ Location: '/dashboard/nodes' });
    headers.append('Set-Cookie', buildNoticeCookie(orgName ? `${outcome}:${orgName}` : outcome));
    headers.append('Set-Cookie', clearPendingCookie(domain));

    return empty_response(302, headers);
}
