import { verifyToken } from '@/app/lib/auth';
import { empty_response } from '@/app/lib/framework';
import { buildServiceReturnCookie, safeServiceUrl } from '@/app/lib/service-return';

export const dynamic = 'force-dynamic';

/**
 * Where the relay sends a browser that opened a service without a usable
 * session. A redirect, never a page.
 *
 * Somebody signed out has the address parked and goes to sign in; the OAuth
 * callback, or the code prompt after it, sends them back. Somebody who already
 * holds a session, such as one refreshed in another tab, goes straight back. An
 * address that is not a proxied service is dropped, and they sign in as usual.
 *
 * Either way the service is reached through the proxy again, which is what
 * decides between the page and a 403.
 */
export async function GET(req: Request) {
    const target = safeServiceUrl(new URL(req.url).searchParams.get('to'));

    let signedIn: boolean;
    try {
        await verifyToken();
        signedIn = true;
    } catch {
        signedIn = false;
    }

    if (signedIn) {
        return empty_response(302, new Headers({ Location: target ?? '/dashboard/nodes' }));
    }

    const headers = new Headers({ Location: '/login' });
    if (target) headers.append('Set-Cookie', buildServiceReturnCookie(target));

    return empty_response(302, headers);
}
