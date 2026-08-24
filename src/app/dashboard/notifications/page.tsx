'use client';

import NotificationsPage from '@/components/notifications/NotificationsPage';

export const dynamic = 'force-dynamic';

/**
 * Notification settings. Shipped — no longer dev-gated.
 *
 * The gate was there because the page configured a pipeline that did not exist:
 * no subscription store, no VAPID keys, no worker. All three exist now
 * (`notification_subscriptions` and `notification_preferences` in
 * docs/notifications-schema.sql, `public/sw.js`, and the VAPID pair the server
 * reports through `/api/config`), so what the page promises is what it does.
 *
 * The demo gate is gone too, and for the reason it named: it was closed only
 * until a notifications fixture existed, because without one the page would
 * have sat inside a demo showing the account's real registered devices beside a
 * sample fleet. `src/lib/demo/` now answers every route this page calls, and
 * `NotificationsPage` skips the browser's push APIs while the demo is on — see
 * `DEMO_CURRENT_ENDPOINT_HASH`, which stands in for a subscription the demo
 * must not create.
 *
 * As with Servers and Users, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Notifications`, outside any check here.
 */
export default function Page() {
    return <NotificationsPage />;
}
