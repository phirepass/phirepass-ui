import {
    buildAuthCookie,
    clearMfaChallengeCookie,
    cookieDomain,
    readMfaChallenge,
    signSession,
} from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { verifySecondFactor } from '@/app/lib/mfa';
import { outcomeResponse, readSubmittedCode } from '@/app/lib/mfa-outcome';
import { mfaGate } from '@/lib/mfa-feature';

/** Matches the session the OAuth callback issues when 2FA is off. */
const SESSION_SECONDS = 7 * 24 * 60 * 60;

/**
 * The second half of sign-in: turns a challenge cookie plus a correct code into
 * a real session.
 *
 * The account is taken from the signed challenge token, never from the request
 * body — otherwise this endpoint would let anyone name a user id and start
 * guessing codes at it. No session exists yet, so `verifyToken` cannot be the
 * guard here; the challenge token is, and it is minted only by the OAuth
 * callback, expires in ten minutes, and is refused anywhere a session is
 * required.
 *
 * The challenge cookie is cleared on success and left in place on a wrong code,
 * so a mistyped digit is a retry rather than a restart of the whole sign-in.
 */
export async function POST(req: Request) {
    const gate = mfaGate();
    if (gate) return gate;

    try {
        const challenge = await readMfaChallenge();
        if (!challenge) {
            return json_response(
                { error: 'This sign-in has expired. Start again.', outcome: 'expired' },
                401,
            );
        }

        const code = readSubmittedCode(await req.json().catch(() => null));
        if (!code) return outcomeResponse('invalid');

        const outcome = await verifySecondFactor(challenge.userId, code);
        if (outcome !== 'ok') return outcomeResponse(outcome);

        const domain = cookieDomain();
        const session = signSession(challenge.userId, challenge.provider, SESSION_SECONDS);

        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Set-Cookie', buildAuthCookie(session, SESSION_SECONDS, domain));
        headers.append('Set-Cookie', clearMfaChallengeCookie(domain));

        return new Response(JSON.stringify({ redirect: '/dashboard/nodes' }), {
            status: 200,
            headers,
        });
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
