import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { issueRecoveryCodes, verifyTotpForUser } from '@/app/lib/mfa';
import {
    isAuthFailure,
    outcomeResponse,
    readSubmittedCode,
    unauthorizedResponse,
} from '@/app/lib/mfa-outcome';
import { mfaGate } from '@/lib/mfa-feature';

/**
 * Replaces the batch of recovery codes, on a current authenticator code.
 *
 * Only a TOTP code, not a recovery code: spending one recovery code to mint ten
 * fresh ones would let anyone holding a single stolen code keep that access
 * indefinitely.
 *
 * The old batch is invalidated whether or not the new one is written down. That
 * is the safer failure — a list nobody has beats a printout still working for
 * whoever found the old one.
 */
export async function POST(req: Request) {
    const gate = mfaGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();

        const code = readSubmittedCode(await req.json().catch(() => null));
        if (!code) return outcomeResponse('invalid');

        const outcome = await verifyTotpForUser(user.id, code);
        if (outcome !== 'ok') return outcomeResponse(outcome);

        const recoveryCodes = await issueRecoveryCodes(user.id);

        return json_response({ recovery_codes: recoveryCodes }, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);

        if (isAuthFailure(e)) return unauthorizedResponse();
        return json_response({ error: 'Server error' }, 500);
    }
}
