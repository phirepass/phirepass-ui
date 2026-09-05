import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { disableMfa, verifySecondFactor } from '@/app/lib/mfa';
import {
    isAuthFailure,
    outcomeResponse,
    readSubmittedCode,
    unauthorizedResponse,
} from '@/app/lib/mfa-outcome';
import { mfaGate } from '@/lib/mfa-feature';

/**
 * Turns two-factor off — on a current code, or a recovery code.
 *
 * A session alone is not enough. The whole point of the second factor is that a
 * stolen session is not the account, and an endpoint that removes it on the
 * strength of that session would hand the attacker the thing they need to keep
 * the account quietly.
 *
 * A recovery code is accepted because the case this has to serve is a phone
 * that is gone: without it, the only route back would be support.
 */
export async function POST(req: Request) {
    const gate = mfaGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();

        const code = readSubmittedCode(await req.json().catch(() => null));
        if (!code) return outcomeResponse('invalid');

        const outcome = await verifySecondFactor(user.id, code);
        if (outcome !== 'ok') return outcomeResponse(outcome);

        await disableMfa(user.id);

        return json_response({ enabled: false }, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);

        if (isAuthFailure(e)) return unauthorizedResponse();
        return json_response({ error: 'Server error' }, 500);
    }
}
