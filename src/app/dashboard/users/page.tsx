'use client';

import { notFound } from 'next/navigation';

import UsersPage from '@/components/users/UsersPage';
import { useDemoMode } from '@/components/DemoModeProvider';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Member administration. No longer dev-gated: the roles this page shows are the
 * ones `src/app/lib/authz.ts` enforces, so it is a `users:read` check — here and,
 * more importantly, on `/api/org/members`, which answers 403 to a plain member
 * whatever this component decides.
 *
 * Closed while demo data is on, for the reason the Notifications page is: the
 * demo answers `/api/…` from a fixture and lets anything it does not recognise
 * through to the real network. There is no members fixture, so left open this
 * page would sit inside a demo listing the presenter's actual colleagues.
 *
 * As with Uptime, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Users`, outside this gate.
 */
export default function Page() {
    const session = useSession();
    const isDemo = useDemoMode();

    // While the profile is still in flight the role is unresolved, and refusing
    // then would 404 the page on every cold load. Nothing is rendered until it
    // arrives; the API is the check that cannot be raced.
    if (session.loading) {
        return <div className="py-24 text-center text-sm text-muted-foreground">Loading…</div>;
    }

    if (isDemo || !session.role || !can(session.role, 'users:read')) {
        notFound();
    }

    return <UsersPage />;
}
