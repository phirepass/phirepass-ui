'use client';

import { notFound } from 'next/navigation';

import NotificationsPage from '@/components/notifications/NotificationsPage';
import { useDemoMode } from '@/components/DemoModeProvider';

export const dynamic = 'force-dynamic';

/**
 * Notification settings. Shipped — no longer dev-gated.
 *
 * The gate was there because the page configured a pipeline that did not exist:
 * no subscription store, no VAPID keys, no worker. All three exist now
 * (`notification_subscriptions` and `notification_preferences` in
 * docs/notifications-schema.sql, `public/sw.js`, and the VAPID pair the server
 * reports through `/api/config`), so what the page promises is what it does. It
 * still promises less than it eventually will — nothing *dispatches* on node
 * transitions yet, which is why "Send test" is the only thing that delivers, and
 * the copy on the page says as much rather than implying otherwise.
 *
 * One gate is left, and it is not about readiness: demo mode. The demo answers
 * `/api/…` from a fixture and lets anything it does not recognise through to the
 * real network (see `src/lib/demo/api.ts`), so this page would sit inside a
 * demo showing the account's actual registered devices beside a sample fleet.
 * That is the one failure demo mode exists to prevent, so the page closes while
 * it is on — remove this only alongside a notifications fixture.
 *
 * As with Servers and Users, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Notifications`, outside this check.
 */
export default function Page() {
    if (useDemoMode()) {
        notFound();
    }

    return <NotificationsPage />;
}
