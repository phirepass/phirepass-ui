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
import { invitePath } from './invitation-link';

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
 * `/invite/<token>`, which is a redirect rather than a page: it accepts the
 * invitation and lands the reader in the dashboard, in the workspace they were
 * invited to, whether or not they were already signed in. See
 * `src/app/invite/[token]/route.ts` for the paths through it.
 *
 * It pointed at `/login?invitation=<token>` before, and nothing read the token:
 * somebody already signed in was bounced to the dashboard without the
 * invitation being looked at, and somebody signing in fresh landed in whichever
 * workspace they already had. The link is still not the credential — the
 * address is, and `acceptInvitation` checks it — so a forwarded one remains
 * useless to anybody else.
 */
export function invitationUrl(token: string): string {
    return new URL(invitePath(token), SITE_URL).toString();
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
        `Accept the invitation: ${link}`,
        '',
        'Sign in with this address — the invitation is tied to it.',
        '',
        `This invitation expires ${expiresLabel}.`,
        '',
        'If you were not expecting this, you can ignore it — nothing happens until you sign in.',
    ].join('\n');

    const html = [
        `<p>${escapeHtml(input.invitedBy)} has invited you to the <strong>${escapeHtml(input.orgName)}</strong> workspace on PhirePass.</p>`,
        `<p><a href="${escapeHtml(link)}">Accept the invitation</a></p>`,
        `<p>Sign in with this address — the invitation is tied to it.</p>`,
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
