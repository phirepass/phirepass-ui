import { authzErrorStatus, requirePermission } from '@/app/lib/authz';
import { json_response } from '@/app/lib/framework';
import { getOrganization, inviteMember, listMembers, normaliseEmail, parseRole } from '@/app/lib/org';
import { sendInvitationEmail } from '@/app/lib/invitation-email';

export const dynamic = 'force-dynamic';

/**
 * Invite an address into the organisation.
 *
 * The invited person need not exist. Sign-in is OAuth, so the ordinary case is
 * an address with no account at all: the invitation waits, and the OAuth
 * callback claims it the first time somebody signs in holding that address
 * (`claimInvitations`). Proving the address is what grants the membership — the
 * link is a convenience, so a forwarded one is useless to anybody else.
 *
 * Re-inviting an address that already has an invitation outstanding is a
 * resend: the role is updated, the clock restarts, and the previous link stops
 * working. That makes this route idempotent enough for a double-clicked button.
 */
export async function POST(req: Request) {
    try {
        const session = await requirePermission('users:invite');
        const payload = await req.json().catch(() => ({})) as { email?: unknown; role?: unknown };

        const email = normaliseEmail(payload.email);
        const role = parseRole(payload.role ?? 'member');

        const invitation = await inviteMember(session, email, role);
        const org = await getOrganization(session.orgId);

        // Delivery is best-effort and deliberately not fatal: the invitation
        // exists in Postgres either way, and it is claimable by signing in with
        // the address whether or not the mail arrived. A 500 here would tell an
        // administrator the invitation failed when it did not.
        const delivery = await sendInvitationEmail({
            to: email,
            orgName: org.name,
            invitedBy: session.user.username || session.user.email,
            token: invitation.token,
            expiresAt: invitation.expires_at,
        });

        return json_response(
            {
                invitation: {
                    id: invitation.id,
                    email: invitation.email,
                    role: invitation.role,
                    expires_at: invitation.expires_at,
                },
                delivery,
                members: await listMembers(session.orgId),
            },
            201,
        );
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
