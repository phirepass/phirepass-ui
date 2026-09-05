import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { readMfaChallenge, verifyToken } from '@/app/lib/auth';
import { MfaChallenge } from '@/components/auth/MfaChallenge';
import { IS_MFA_ENABLED } from '@/lib/mfa-feature';

export const metadata: Metadata = {
    title: 'Two-step verification',
    description: 'Confirm the sign-in with your authenticator app.',
    robots: { index: false, follow: false },
};

/** Nothing about this page is cacheable: it exists to read two cookies. */
export const dynamic = 'force-dynamic';

/**
 * The code prompt, reachable only mid-sign-in.
 *
 * Both redirects are ordinary states rather than errors. Someone who already
 * has a session has nothing to prove — a stale bookmark to this URL should land
 * them in the dashboard. Someone with neither cookie is not signing in at all,
 * and gets the sign-in page rather than a form that cannot succeed.
 */
export default async function MfaVerifyPage() {
    // Nothing here can succeed where the endpoints 404, so the page is the
    // sign-in page instead of a form with no server behind it.
    if (!IS_MFA_ENABLED) {
        redirect('/login');
    }

    // `redirect` signals by throwing, so it has to happen outside the try —
    // inside, the catch that is there for "no session" would swallow it.
    let authenticated: boolean;
    try {
        await verifyToken();
        authenticated = true;
    } catch {
        authenticated = false;
    }

    if (authenticated) {
        redirect('/dashboard/nodes');
    }

    const challenge = await readMfaChallenge();
    if (!challenge) {
        redirect('/login');
    }

    return <MfaChallenge />;
}
