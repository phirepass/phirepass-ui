'use client';

import { notFound } from 'next/navigation';

import ServersPage from '@/components/servers/ServersPage';
import { IS_DEV_MODE } from '@/lib/dev-mode';

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
    // Statically false in a production bundle, so the page and everything it
    // imports drops out of that build rather than merely being unreachable.
    if (!IS_DEV_MODE) {
        notFound();
    }

    return <ServersPage />;
}
