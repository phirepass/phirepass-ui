import { verifyToken } from '@/app/lib/auth';
import {
    contactHtml,
    contactSubject,
    contactText,
    isHoneypotTripped,
    parseContact,
    type ContactContext,
} from '@/app/lib/contact-input';
import { getOrIssueCsrfToken, verifyCsrfToken } from '@/app/lib/csrf';
import { getMailer, sendEmail } from '@/app/lib/email';
import { json_response } from '@/app/lib/framework';
import { getRedisClient } from '@/app/lib/redis';

export const dynamic = 'force-dynamic';

/** Per-IP budget. Generous for a person, useless for a form-spam run. */
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 60 * 60;

/**
 * The caller's address, as Traefik forwarded it. Only the first hop is used —
 * the rest of `x-forwarded-for` is client-supplied and cannot be trusted.
 */
function clientIp(req: Request): string | null {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }

    return req.headers.get('x-real-ip');
}

/**
 * Counts this send against the IP's hourly budget.
 *
 * Fails open: when Redis is unavailable the message still goes out. A support
 * form that silently stops accepting mail during a cache outage is a worse
 * failure than an hour of unthrottled spam.
 */
async function withinRateLimit(ip: string | null): Promise<boolean> {
    if (!ip) return true;

    try {
        const redis = await getRedisClient();
        if (!redis) return true;

        const key = `contact:rate:${ip}`;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, RATE_WINDOW_SECONDS);
        }

        return count <= RATE_LIMIT;
    } catch (e) {
        console.warn('[contact] rate limit check failed', e);
        return true;
    }
}

/**
 * Hands the form the CSRF token it posts back, minting one if the browser has
 * none. Called when the dialog opens.
 */
export async function GET() {
    const { token, cookie } = await getOrIssueCsrfToken();

    const headers = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
    });
    // Absent when the browser already holds a usable token.
    if (cookie) headers.set('Set-Cookie', cookie);

    return new Response(JSON.stringify({ token }), { status: 200, headers });
}

export async function POST(req: Request) {
    try {
        const mailer = getMailer();
        if (!mailer) {
            console.warn('[contact] mail is not configured (MAILER_API_KEY)');
            return json_response(
                { error: 'Support email is not configured on this deployment' },
                503,
            );
        }

        const body = await req.json().catch(() => null);

        // Answered as a success: telling a bot which field gave it away only
        // teaches it to leave that one empty next time.
        if (isHoneypotTripped(body)) {
            return json_response({ ok: true }, 202);
        }

        // Before anything expensive: a forged cross-origin POST carries the
        // cookie but cannot read it, so it cannot also carry the token.
        const submittedToken = (body as { csrfToken?: unknown } | null)?.csrfToken;
        if (!(await verifyCsrfToken(submittedToken))) {
            return json_response(
                { error: 'Your form session expired. Please reopen the form and try again.' },
                403,
            );
        }

        const parsed = parseContact(body);
        if (!parsed.ok) {
            return json_response({ error: parsed.error }, 400);
        }

        const ip = clientIp(req);
        if (!(await withinRateLimit(ip))) {
            return json_response(
                { error: 'Too many messages from this address. Please try again later.' },
                429,
            );
        }

        // Signed-in senders are identified from their session, so a support
        // request cannot claim to come from someone else's account.
        let account: { id: string; email: string } | null = null;
        try {
            const user = await verifyToken();
            account = { id: user.id, email: user.email };
        } catch {
            account = null;
        }

        const context: ContactContext = {
            accountEmail: account?.email ?? null,
            accountId: account?.id ?? null,
            ip,
            userAgent: req.headers.get('user-agent'),
            referer: req.headers.get('referer'),
        };

        const result = await sendEmail(mailer, {
            subject: contactSubject(parsed.value),
            text: contactText(parsed.value, context),
            html: contactHtml(parsed.value, context),
            replyTo: parsed.value.email,
        });

        if (!result.ok) {
            console.warn('[contact] send failed', result.error);
            return json_response(
                { error: 'Could not send your message right now. Please try again.' },
                502,
            );
        }

        return json_response({ ok: true, id: result.id }, 201);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
