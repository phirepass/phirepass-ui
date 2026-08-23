import type { WebhookBody } from '@/app/lib/webhooks';
import { verifySignature } from './webhook-signature.ts';

/**
 * The receiving half of the webhook contract, as a test target.
 *
 * `webhooks.ts` sends and signs; this judges what arrives. It exists so the
 * signature scheme can be exercised end to end against a real deployment —
 * register `https://<host>/api/webhook` as an endpoint, fire a test, and see
 * whether the bytes that arrived verify under the secret the row holds.
 *
 * Both senders — the dashboard's own `deliver()` and the courier's
 * `delivery/webhook.rs` — emit the same headers over the same signed material,
 * which is the property this is most useful for checking: a receiver is written
 * once and must not care which one called it.
 */

/** How stale a delivery may be before it is refused as a possible replay. */
export const MAX_AGE_SECONDS = 300;

/** Bodies are two short strings; anything larger is not one of ours. */
export const MAX_BODY_BYTES = 64 * 1024;

/** One secret this receiver is willing to check a delivery against. */
export interface CandidateSecret {
    id: string;
    label: string | null;
    secret: string;
}

export interface DeliveryHeaders {
    signature: string | null;
    timestamp: string | null;
    event: string | null;
    delivery: string | null;
}

export interface Verdict {
    ok: boolean;
    /** What the receiver answers. A test target that always says 200 tests nothing. */
    status: number;
    reason: string;
    /** Which registered endpoint's secret verified it, when one did. */
    matched: { id: string; label: string | null } | null;
    ageSeconds: number | null;
}

/**
 * Decides what to answer for one delivery.
 *
 * Deliberately strict. The point of this endpoint is to prove the signature
 * works, so anything it cannot verify is a non-2xx — which is also what makes
 * the dashboard's endpoint list show the failure instead of a reassuring green
 * row. `fail_count` incrementing on a bad signature is the correct outcome.
 */
export function judgeDelivery(
    headers: DeliveryHeaders,
    rawBody: string,
    secrets: CandidateSecret[],
    nowSeconds: number,
): Verdict {
    if (!headers.signature || !headers.timestamp) {
        return {
            ok: false,
            status: 400,
            reason: 'X-Phirepass-Signature and X-Phirepass-Timestamp are required',
            matched: null,
            ageSeconds: null,
        };
    }

    // The scheme is named in the header so it can change without the receiver
    // silently comparing a sha256 against something else.
    if (!headers.signature.startsWith('sha256=')) {
        return {
            ok: false,
            status: 400,
            reason: 'the signature is not a sha256= value',
            matched: null,
            ageSeconds: null,
        };
    }
    const signature = headers.signature.slice('sha256='.length);

    const sent = Number(headers.timestamp);
    if (!Number.isFinite(sent)) {
        return {
            ok: false,
            status: 400,
            reason: 'the timestamp is not a number',
            matched: null,
            ageSeconds: null,
        };
    }

    // Checked before the HMAC, and the HMAC covers it: the age is inside the
    // signed material, so a captured delivery cannot be replayed with a fresh
    // header. Absolute, because a clock either side can be the fast one — as
    // this deployment has already been bitten by once, on VAPID.
    const ageSeconds = nowSeconds - sent;
    if (Math.abs(ageSeconds) > MAX_AGE_SECONDS) {
        return {
            ok: false,
            status: 400,
            reason: `the delivery is ${ageSeconds}s old, outside the ${MAX_AGE_SECONDS}s window`,
            matched: null,
            ageSeconds,
        };
    }

    if (secrets.length === 0) {
        return {
            ok: false,
            status: 401,
            reason: 'no enabled webhook endpoint is registered against this URL, so there is no secret to check against',
            matched: null,
            ageSeconds,
        };
    }

    // Every secret registered against *this* URL is tried, because the delivery
    // says which notification it is but not which endpoint row sent it. The set
    // is already narrowed to rows pointing here, so this is not a search of
    // other people's secrets.
    for (const candidate of secrets) {
        if (verifySignature(candidate.secret, headers.timestamp, rawBody, signature)) {
            return {
                ok: true,
                status: 200,
                reason: 'verified',
                matched: { id: candidate.id, label: candidate.label },
                ageSeconds,
            };
        }
    }

    return {
        ok: false,
        status: 401,
        reason: 'the signature does not verify under any secret registered against this URL',
        matched: null,
        ageSeconds,
    };
}

/** What `GET /api/webhook` shows back. */
export interface ReceivedDelivery {
    received_at: string;
    event: string | null;
    delivery: string | null;
    verdict: Verdict;
    /** Parsed when it is JSON, so the page can show the payload rather than a blob. */
    body: WebhookBody | string;
}

/**
 * The last deliveries, in memory.
 *
 * In memory on purpose: this is a test target, and a table would need a
 * migration, a retention policy and a reason to keep other people's payloads.
 * The cost is that it empties on redeploy and is per-container — fine for
 * "fire a test and look", wrong for anything that needs to be durable.
 */
const RING_SIZE = 50;
const ring: ReceivedDelivery[] = [];

export function record(entry: ReceivedDelivery): void {
    ring.unshift(entry);
    if (ring.length > RING_SIZE) ring.length = RING_SIZE;
}

export function recent(): ReceivedDelivery[] {
    return [...ring];
}

/** Test seam: the ring is module state and would otherwise leak between cases. */
export function clearReceived(): void {
    ring.length = 0;
}
