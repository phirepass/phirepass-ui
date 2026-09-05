import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { completeEnrollment } from '@/app/lib/mfa';
import {
    isAuthFailure,
    outcomeResponse,
    readSubmittedCode,
    unauthorizedResponse,
} from '@/app/lib/mfa-outcome';
import { mfaGate } from '@/lib/mfa-feature';

/**
 * Finishes enrolment on proof of one working code, and returns the recovery
 * codes.
 *
 * This is the only response that ever contains them. The database holds
 * digests, so a person who closes this dialog without writing them down has to
 * regenerate rather than be shown them again — which is the property that makes
 * a stolen session unable to read them off an already-protected account.
 */
export async function POST(req: Request) {
    const gate = mfaGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();

        const code = readSubmittedCode(await req.json().catch(() => null));
        if (!code) return outcomeResponse('invalid');

        const { outcome, recoveryCodes } = await completeEnrollment(user.id, code);
        if (outcome !== 'ok') return outcomeResponse(outcome);

        return json_response({ recovery_codes: recoveryCodes }, 200);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);

        if (isAuthFailure(e)) return unauthorizedResponse();
        return json_response({ error: 'Server error' }, 500);
    }
}
