'use client';

import { notFound } from 'next/navigation';

import ServersPage from '@/components/servers/ServersPage';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * Fleet administration. Dev-gated for now because there is no API behind it and
 * no RBAC to restrict it — once roles ship this becomes a `servers:read` check
 * (see `src/lib/rbac.ts`), enforced on the route as well as in the UI.
 *
 * As with Uptime, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Servers`, outside this gate.
 */
export default function Page() {
    // Closed in a production build, and while demo data is on — an unfinished
    // page has no business in front of an audience. The gate is not a
    // tree-shake: see the note on the Notifications page for what it is and is
    // not, and do not put anything here that must not ship.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <ServersPage />;
}
