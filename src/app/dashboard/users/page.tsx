'use client';

import { notFound } from 'next/navigation';

import UsersPage from '@/components/users/UsersPage';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * User administration. Dev-gated for now: the roles this page displays are not
 * enforced anywhere yet, so shipping it would imply an access model that does
 * not exist. Once RBAC lands it becomes a `users:read` check (see
 * `src/lib/rbac.ts`), enforced on the route as well as in the UI.
 *
 * As with Uptime, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Users`, outside this gate.
 */
export default function Page() {
    // Closed in a production build, and while demo data is on — an unfinished
    // page has no business in front of an audience. The gate is not a
    // tree-shake: see the note on the Notifications page for what it is and is
    // not, and do not put anything here that must not ship.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <UsersPage />;
}
