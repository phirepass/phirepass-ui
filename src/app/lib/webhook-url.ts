import { IS_DEV_MODE } from '@/lib/dev-mode';

/**
 * Webhook destination validation, and nothing else.
 *
 * Its own module for the same reason `webhook-signature.ts` is: this is a rule
 * the *client* has to apply too. `src/lib/demo/api.ts` answers the dashboard's
 * own API calls in the browser and is required to refuse exactly what the real
 * route refuses — a demo that accepts a URL the product would reject is a demo
 * of something that does not exist. Reaching it through `webhooks.ts` would
 * pull `pg` into the client bundle.
 */

export class WebhookUrlError extends Error {}

/**
 * Validates a destination URL and returns it normalised.
 *
 * Three refusals, in order of how badly they would go wrong:
 *
 * 1. Anything that is not http(s). `file:` and friends are not something an
 *    outbound POST should ever be pointed at.
 * 2. Plain http in production. The body carries node names and the signature
 *    header; sending both in clear over someone else's network defeats the
 *    point of signing it. Allowed in dev, where the receiver is usually a
 *    terminal on the same machine.
 * 3. Hosts that are obviously *ours* rather than the person's — loopback, link
 *    local, and the RFC1918 ranges written as literal IPs. This app can reach
 *    Postgres, Redis and the courier's unauthenticated intake on its own
 *    network; a URL pointing back into it turns "add a webhook" into "make the
 *    server POST anywhere inside the deployment".
 *
 * The third check is on the literal host only. A name that *resolves* to a
 * private address still passes, because the resolution happens inside `fetch`
 * and re-resolving here would be a check against a different answer than the
 * one used. Closing that needs a custom agent that pins the resolved address —
 * worth doing if this ever accepts endpoints from untrusted accounts.
 */
export function parseUrl(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new WebhookUrlError('A URL is required');
    }

    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new WebhookUrlError('That is not a valid URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new WebhookUrlError('The URL has to be http or https');
    }

    if (url.protocol === 'http:' && !IS_DEV_MODE) {
        throw new WebhookUrlError('The URL has to be https');
    }

    if (isInternalHost(url.hostname)) {
        throw new WebhookUrlError('That host is not reachable as a webhook destination');
    }

    if (url.href.length > 2048) {
        throw new WebhookUrlError('That URL is too long');
    }

    // `href` rather than the raw string: it collapses the equivalent spellings
    // of one endpoint, which is what makes the per-user unique index mean
    // something.
    return url.href;
}

function isInternalHost(hostname: string): boolean {
    // Localhost is the normal target while developing against a terminal-side
    // receiver, and there is nothing else on the loopback of a dev machine
    // worth protecting from the dev running it.
    if (IS_DEV_MODE) return false;

    const host = hostname.toLowerCase().replace(/^\[|]$/g, '');

    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        return true;
    }

    // IPv6 loopback and the unique-local / link-local prefixes.
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
        return true;
    }

    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!v4) return false;

    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127                        // loopback
        || a === 10                         // RFC1918
        || a === 0                          // "this network"
        || (a === 192 && b === 168)         // RFC1918
        || (a === 172 && b >= 16 && b <= 31) // RFC1918
        || (a === 169 && b === 254);        // link local, incl. cloud metadata
}

/** Falls back to the host, which is what people would have typed anyway. */
export function defaultLabel(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return 'Webhook';
    }
}
