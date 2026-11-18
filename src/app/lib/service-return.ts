/**
 * Getting somebody back to a proxied service after they have signed in.
 *
 * The relay sends a browser with no usable session to `/auth/return?to=<url>`,
 * and that address has to survive the trip through GitHub and the code prompt.
 * It is parked in a cookie for the same reason an invitation is: OAuth's
 * redirect URI is fixed, and `state` is the browser's to choose.
 *
 * `to` is supplied by whoever wrote the link, and a sign-in that redirects
 * anywhere it is told to is a phishing page with our domain on it. So
 * {@link safeServiceUrl} accepts proxied services and nothing else, and it runs
 * again where the cookie is read — a cookie is the browser's to edit, so passing
 * the check once proves nothing about what comes back.
 *
 * Nothing here touches the database or `node:crypto`, so it tests without a
 * server. Whether the person may reach the node is not decided here at all: they
 * land on the service and the proxy answers 403 if not.
 */

export const SERVICE_RETURN_COOKIE = 'phirepass_service_return';

/** An OAuth round trip plus the code prompt, whose challenge lasts ten minutes. */
const TTL_SECONDS = 15 * 60;

/** A cookie holds about 4 KiB and this one is percent-encoded. */
const MAX_URL_LENGTH = 2048;

const DEFAULT_PROXY_DOMAIN = 'http.proxy.phirepass.com';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const NODE_LABEL = new RegExp(`^${UUID}$`, 'i');
const NODE_PATH = new RegExp(`^/api/web/http/${UUID}(/|$)`, 'i');

/** The domain proxied services hang off. */
export function proxyDomain(): string {
    return process.env.HTTP_PROXY_DOMAIN || DEFAULT_PROXY_DOMAIN;
}

/**
 * `raw` as a normalised URL if it addresses a proxied service, otherwise `null`.
 *
 * Both of the relay's forms are accepted: `{node}.{domain}/...` and
 * `{domain}/api/web/http/{node}/...`. The host is compared exactly rather than
 * by suffix, so `{node}.http.proxy.phirepass.com.example.org` is not one of ours.
 */
export function safeServiceUrl(
    raw: string | null | undefined,
    domain: string = proxyDomain(),
    production: boolean = process.env.NODE_ENV === 'production',
): string | null {
    if (!raw || raw.length > MAX_URL_LENGTH) return null;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    const allowedProtocol =
        url.protocol === 'https:' || (!production && url.protocol === 'http:');
    if (!allowedProtocol || url.username || url.password) return null;
    if (production && url.port) return null;

    const [label, ...rest] = url.hostname.split('.');
    const isNodeHost = NODE_LABEL.test(label) && rest.join('.') === domain;
    const isNodePath = url.hostname === domain && NODE_PATH.test(url.pathname);

    return isNodeHost || isNodePath ? url.href : null;
}

function attributes(maxAge: number): string[] {
    const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    return parts;
}

/**
 * Host-only on purpose. With the session's `Domain`, this would go out on every
 * proxied request and reach the local services behind them.
 */
export function buildServiceReturnCookie(url: string): string {
    return [`${SERVICE_RETURN_COOKIE}=${encodeURIComponent(url)}`, ...attributes(TTL_SECONDS)].join('; ');
}

export function clearServiceReturnCookie(): string {
    return [`${SERVICE_RETURN_COOKIE}=`, ...attributes(0)].join('; ');
}
