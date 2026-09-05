import QRCode from 'qrcode';

import { verifyToken } from '@/app/lib/auth';
import { json_response } from '@/app/lib/framework';
import { beginEnrollment } from '@/app/lib/mfa';
import { isAuthFailure, unauthorizedResponse } from '@/app/lib/mfa-outcome';
import { formatSecretForDisplay } from '@/app/lib/totp';
import { mfaGate } from '@/lib/mfa-feature';

/**
 * Starts enrolment: mints a secret, stores it unconfirmed, and hands back the
 * three forms of it the screen needs — a QR image to scan, the raw string to
 * type on a device with no camera, and the `otpauth:` URI behind both.
 *
 * A POST rather than a GET despite reading like one: it writes a new secret
 * every time, and a link that could be prefetched must not do that.
 *
 * The QR is rendered here rather than in the browser so no QR library reaches
 * the client bundle. It is a data URL of a PNG on white — a QR code is scanned
 * by a phone camera pointed at a screen, and inverting it for dark mode is how
 * you get one that will not read.
 */
export async function POST(req: Request) {
    const gate = mfaGate();
    if (gate) return gate;

    try {
        const user = await verifyToken();

        const { secret, uri } = await beginEnrollment(user.id, user.email || user.username);

        const qr = await QRCode.toDataURL(uri, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 280,
            color: { dark: '#000000ff', light: '#ffffffff' },
        });

        return json_response(
            {
                secret,
                secret_display: formatSecretForDisplay(secret),
                uri,
                qr,
            },
            201,
        );
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);

        if (isAuthFailure(e)) return unauthorizedResponse();

        if (e instanceof Error && e.message === 'MFA is already enabled') {
            // Deliberately not a silent reissue: swapping the authenticator on a
            // protected account is turning it off and on again, which asks for a
            // code first.
            return json_response(
                { error: 'Two-factor authentication is already on. Turn it off first to enrol a new device.' },
                409,
            );
        }

        return json_response({ error: 'Server error' }, 500);
    }
}
