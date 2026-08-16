import { Resend } from 'resend';

/**
 * Outbound mail, through the `resend` SDK.
 *
 * The credential is the only thing that varies per deployment, and it is read
 * at call time rather than at module load, so an install without mail still
 * boots — the route turns a missing key into a 503 instead of crashing at
 * import. `MAILER_API_KEY` is named for the job, not the vendor: swapping
 * providers is a change to this file, not to every environment.
 */

/**
 * Sender. `onboarding@resend.dev` is Resend's shared sandbox address, which
 * only delivers to the account's own owner — swap it for an address on a
 * verified domain before support mail has to reach anywhere else.
 */
const FROM_MAIL_ADDRESS = 'support@phirepass.com';

/** Where support mail lands. `Reply-To` carries whoever wrote in. */
const TO_MAILER_ADDRESS = [ 'phirepass153@gmail.com' ];

/** The SDK exposes no per-request timeout, so sends are raced against this. */
const SEND_TIMEOUT_MS = 10_000;

let client: Resend | null = null;
let clientKey: string | null = null;

/**
 * The mail client, or `null` when this deployment has no mail configured.
 *
 * Cached against the key it was built from, so a rotated `MAILER_API_KEY` is
 * picked up on the next send rather than living on in a stale client.
 */
export function getMailer(): Resend | null {
    const apiKey = process.env.MAILER_API_KEY;
    if (!apiKey) {
        client = null;
        clientKey = null;
        return null;
    }

    if (!client || clientKey !== apiKey) {
        client = new Resend(apiKey);
        clientKey = apiKey;
    }

    return client;
}

export type SendEmailInput = {
    subject: string;
    text: string;
    html?: string;
    /** Set so a support reply goes to the person who wrote in, not to us. */
    replyTo?: string;
};

export type SendEmailResult =
    | { ok: true; id: string | null }
    | { ok: false; error: string };

export async function sendEmail(
    mailer: Resend,
    input: SendEmailInput,
): Promise<SendEmailResult> {
    // A hung provider must not hold the request open until the platform's own
    // timeout: the caller gets a failure it can report instead. The send itself
    // is left to finish or fail on its own — there is nothing to cancel it with.
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`No response within ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS);
    });

    try {
        const { data, error } = await Promise.race([
            mailer.emails.send({
                from: FROM_MAIL_ADDRESS,
                to: TO_MAILER_ADDRESS,
                subject: input.subject,
                text: input.text,
                ...(input.html ? { html: input.html } : {}),
                ...(input.replyTo ? { replyTo: input.replyTo } : {}),
            }),
            timeout,
        ]);

        // The SDK reports API failures in `error` rather than by throwing.
        if (error) {
            return { ok: false, error: error.message || error.name };
        }

        return { ok: true, id: data?.id ?? null };
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `Mail request failed: ${reason}` };
    }
}
