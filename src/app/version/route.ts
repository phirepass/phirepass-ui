import { version } from '../../../package.json';

/**
 * Build identity, for checking what is actually deployed.
 *
 * Sits at the root beside `/readyz` rather than under `/api/*`: those are the
 * operational endpoints, unauthenticated and meant for humans and probes rather
 * than for the dashboard. It answers before any session check, so it works when
 * you cannot log in — which is usually when you most want to know which build
 * is running.
 *
 * The version is read from `package.json` at build time, so it reports the
 * version of the bundle serving the request rather than whatever happens to be
 * on disk next to it.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    return Response.json(
        { version },
        {
            headers: {
                // A cached version endpoint reports the build you had, not the
                // one you have, which defeats the point of asking.
                'Cache-Control': 'no-store',
            },
        },
    );
}
