'use client';

import { notFound } from 'next/navigation';

import UsersPage from '@/components/users/UsersPage';
import { IS_DEV_MODE } from '@/lib/dev-mode';

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
    // Statically false in a production bundle, so the page and everything it
    // imports drops out of that build rather than merely being unreachable.
    if (!IS_DEV_MODE) {
        notFound();
    }

    return <UsersPage />;
}
