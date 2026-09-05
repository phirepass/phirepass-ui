import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { getMfaStatus } from '@/app/lib/mfa';
import { isAuthFailure, unauthorizedResponse } from '@/app/lib/mfa-outcome';
import { mfaGate } from '@/lib/mfa-feature';

/**
 * What Settings draws: whether this account has an authenticator, and how many
 * recovery codes are left of the batch it was given.
 *
 * Never the secret, and never the codes — both exist in readable form exactly
 * once, in the response that created them.
 */
export async function GET(req: Request) {
    const gate = mfaGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();
        const status = await getMfaStatus(user.id);

        return json_response(status, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);

        if (isAuthFailure(e)) return unauthorizedResponse();

        return json_response({ error: 'Server error' }, 500);
    }
}
