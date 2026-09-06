/**
 * The one message this product sends to somebody who is not a user yet.
 *
 * Deliberately thin, and deliberately not load-bearing. The invitation lives in
 * Postgres and is claimed by signing in with the invited address — the link is a
 * shortcut to the sign-in page, not the credential. So a deployment with no
 * `MAILER_API_KEY`, a provider outage, or a bounced address all leave a working
 * invitation behind; the administrator is told delivery did not happen and can
 * pass the address along by any other means.
 *
 * That is why this returns a result instead of throwing: the caller reports it,
 * it does not fail the request.
 */

import { getMailer, sendEmail } from './email';
import { SITE_URL } from '@/lib/site';

export type InvitationDelivery =
    | { sent: true; id: string | null }
    | { sent: false; reason: string };

export interface InvitationEmailInput {
    to: string;
    orgName: string;
    /** Whoever pressed the button — a username, falling back to their address. */
    invitedBy: string;
    token: string;
    expiresAt: string;
}

/**
 * Where the link points.
 *
 * `/login` rather than a bespoke accept page: the whole flow is "sign in with
 * the address that was invited", and a page whose only job is to forward to
 * OAuth is a page that can go wrong. The token rides along so a future accept
 * screen — one that names the organisation before asking anybody to sign in —
 * has something to look the invitation up by without changing the mail.
 */
export function invitationUrl(token: string): string {
    const url = new URL('/login', SITE_URL);
    url.searchParams.set('invitation', token);
    return url.toString();
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<InvitationDelivery> {
    const mailer = getMailer();
    if (!mailer) {
        return { sent: false, reason: 'No mail provider is configured for this deployment' };
    }

    const link = invitationUrl(input.token);
    const expires = new Date(input.expiresAt);
    const expiresLabel = Number.isNaN(expires.getTime())
        ? 'in 14 days'
        : `on ${expires.toISOString().slice(0, 10)}`;

    const text = [
        `${input.invitedBy} has invited you to the ${input.orgName} workspace on PhirePass.`,
        '',
        `Sign in with this address to accept: ${link}`,
        '',
        `This invitation expires ${expiresLabel}.`,
        '',
        'If you were not expecting this, you can ignore it — nothing happens until you sign in.',
    ].join('\n');

    const html = [
        `<p>${escapeHtml(input.invitedBy)} has invited you to the <strong>${escapeHtml(input.orgName)}</strong> workspace on PhirePass.</p>`,
        `<p><a href="${escapeHtml(link)}">Sign in with this address to accept</a></p>`,
        `<p>This invitation expires ${escapeHtml(expiresLabel)}.</p>`,
        `<p>If you were not expecting this, you can ignore it — nothing happens until you sign in.</p>`,
    ].join('\n');

    const result = await sendEmail(mailer, {
        to: input.to,
        subject: `You have been invited to ${input.orgName} on PhirePass`,
        text,
        html,
    });

    return result.ok ? { sent: true, id: result.id } : { sent: false, reason: result.error };
}
