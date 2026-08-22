'use client';

import { notFound } from 'next/navigation';

import NotificationsPage from '@/components/notifications/NotificationsPage';
import { IS_DEV_MODE } from '@/lib/dev-mode';

export const dynamic = 'force-dynamic';

/**
 * Notification settings. Dev-gated: the page configures a delivery pipeline that
 * does not exist — no push subscription store, no VAPID keys, no worker — so
 * shipping it would promise alerts nobody would ever receive. The event
 * catalogue it is built around is real (see `src/types/notification.ts`); only
 * the devices and the saved preferences are mock.
 *
 * As with Servers and Users, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Notifications`, outside this gate.
 *
 * What the gate is, precisely — measured against a production build rather than
 * assumed, because the equivalent comments on the Servers and Users pages
 * overstate it:
 *
 *   - `IS_DEV_MODE` is statically `false` in a production bundle, so `notFound()`
 *     always runs there and the visitor gets `app/not-found.tsx`.
 *   - It does *not* tree-shake. `notFound()` throws, but the minifier cannot
 *     know that, so the `return` below stays live and `NotificationsPage` and
 *     everything it imports remain in the built chunks. Nothing here is secret —
 *     the mock data is invented and the event list is public product vocabulary —
 *     but do not add anything to this page that must not ship.
 *   - The route still answers 200, not 404. The dashboard layout is a client
 *     component, so its shell streams and commits a status before this file
 *     runs; `src/proxy.ts` documents the same problem for the withdrawn routes
 *     and solves it at the edge. If this ever needs a real server-side gate,
 *     that is where it goes.
 */
export default function Page() {
    if (!IS_DEV_MODE) {
        notFound();
    }

    return <NotificationsPage />;
}
