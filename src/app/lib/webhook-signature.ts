import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The webhook signing scheme, and nothing else.
 *
 * Its own module, with no dependencies beyond `node:crypto`, because this is
 * the one piece of `webhooks.ts` that is a *contract* rather than an
 * implementation: `courier/src/delivery/webhook.rs` signs the same material in
 * Rust, `sw.js`-side receivers verify it, and a receiver is written once and
 * cannot care which sender called it. Kept separable so it can be exercised
 * without a database pool behind it.
 */

/**
 * Signs the exact bytes that are sent, over `timestamp.body`.
 *
 * The timestamp is inside the signed material rather than beside it so a
 * captured delivery cannot be replayed later with its own header rewritten —
 * the receiver checks the age and the signature covers the age it checked.
 */
export function signBody(secret: string, timestamp: string, body: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Constant-time compare for a receiver written against this same module.
 * Exported because the shape of the check is half the contract: a `===` here is
 * a timing oracle on the signature.
 */
export function verifySignature(secret: string, timestamp: string, body: string, signature: string): boolean {
    const expected = Buffer.from(signBody(secret, timestamp, body));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
}
