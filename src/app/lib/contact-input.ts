import { CONTACT_TOPICS, CONTACT_TOPIC_LABELS, type ContactTopic } from '@/types/contact';

/**
 * Validation for the support contact body.
 *
 * Hand-rolled, in the style of `monitor-input.ts` — zod is a dependency but the
 * API routes in this codebase do not use it.
 *
 * The dialog enforces the same limits, but they are affordances: this endpoint
 * is unauthenticated (support has to be reachable by someone who cannot sign
 * in), so a direct POST reaches this code instead.
 */

export type ParsedContact = {
    name: string;
    email: string;
    topic: ContactTopic;
    message: string;
};

export type ParseResult =
    | { ok: true; value: ParsedContact }
    | { ok: false; error: string };

export const CONTACT_LIMITS = {
    name: 120,
    email: 254,
    message: 5000,
} as const;

/** The shortest message worth a support ticket; below this it is a stray click. */
const MIN_MESSAGE = 10;

// Deliberately loose: the only thing worth rejecting here is what cannot be a
// mailbox at all. Anything stricter turns a real address into a support request
// that never arrives.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Strips control characters from a value that lands in a mail header. Without
 * this a newline in the name — or in the address the reply-to is built from —
 * could inject extra headers.
 */
function headerSafe(value: string): string {
    // Compared by code point rather than matched by a regex: a character class
    // spelling out the control range trips `no-control-regex`, and the rule is
    // right that such a class is usually a mistake.
    return [...value]
        .map((char) => {
            const code = char.codePointAt(0) ?? 0;
            return code < 0x20 || code === 0x7f ? ' ' : char;
        })
        .join('')
        .trim();
}

export function parseContact(body: unknown): ParseResult {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: 'Expected a JSON object' };
    }

    const input = body as Record<string, unknown>;

    const name = headerSafe(asString(input.name));
    if (!name) return { ok: false, error: 'Your name is required' };
    if (name.length > CONTACT_LIMITS.name) {
        return { ok: false, error: `Name must be at most ${CONTACT_LIMITS.name} characters` };
    }

    const email = headerSafe(asString(input.email));
    if (!email) return { ok: false, error: 'An email address is required' };
    if (email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(email)) {
        return { ok: false, error: 'That does not look like an email address' };
    }

    const topicRaw = asString(input.topic) || 'general';
    if (!(CONTACT_TOPICS as readonly string[]).includes(topicRaw)) {
        return { ok: false, error: 'Unknown topic' };
    }
    const topic = topicRaw as ContactTopic;

    const message = asString(input.message);
    if (message.length < MIN_MESSAGE) {
        return { ok: false, error: `Message must be at least ${MIN_MESSAGE} characters` };
    }
    if (message.length > CONTACT_LIMITS.message) {
        return { ok: false, error: `Message must be at most ${CONTACT_LIMITS.message} characters` };
    }

    return { ok: true, value: { name, email, topic, message } };
}

/**
 * Whether the honeypot field was filled. It is hidden from people and from
 * assistive technology, so anything in it came from a bot filling every input
 * on the form.
 */
export function isHoneypotTripped(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    return asString((body as Record<string, unknown>).company).length > 0;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type ContactContext = {
    /** Set when the sender was signed in — worth more than the typed address. */
    accountEmail?: string | null;
    accountId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    /** The page the dialog was opened from. */
    referer?: string | null;
};

function contextLines(context: ContactContext): string[] {
    const lines: string[] = [];
    if (context.accountEmail) {
        lines.push(`Account: ${context.accountEmail}${context.accountId ? ` (${context.accountId})` : ''}`);
    } else {
        lines.push('Account: not signed in');
    }
    if (context.referer) lines.push(`Page: ${context.referer}`);
    if (context.ip) lines.push(`IP: ${context.ip}`);
    if (context.userAgent) lines.push(`User agent: ${context.userAgent}`);
    return lines;
}

/**
 * `[Support] Billing & account` — the whole subject line, since the form no
 * longer asks for one: the topic is the only thing a sender chooses, and it is
 * what a mailbox filter can sort on. What the message is actually about is the
 * first thing in the body.
 */
export function contactSubject(contact: ParsedContact): string {
    return `[Support] ${CONTACT_TOPIC_LABELS[contact.topic]}`;
}

export function contactText(contact: ParsedContact, context: ContactContext): string {
    return [
        `From: ${contact.name} <${contact.email}>`,
        `Topic: ${contact.topic}`,
        ...contextLines(context),
        '',
        contact.message,
    ].join('\n');
}

export function contactHtml(contact: ParsedContact, context: ContactContext): string {
    const meta = [
        `From: ${contact.name} &lt;${escapeHtml(contact.email)}&gt;`,
        `Topic: ${escapeHtml(contact.topic)}`,
        ...contextLines(context).map(escapeHtml),
    ]
        .map((line) => `<div style="color:#64748b">${line}</div>`)
        .join('');

    return [
        '<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.6">',
        `<div style="margin-bottom:16px">${meta}</div>`,
        `<div style="white-space:pre-wrap">${escapeHtml(contact.message)}</div>`,
        '</div>',
    ].join('');
}
