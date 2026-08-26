'use client';

import { notFound } from 'next/navigation';

import Webhooks from '@/components/webhooks/Webhooks';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * Outbound webhooks. Dev-gated, and note this is *not* the shipped notification
 * webhook: real, delivered webhooks are configured under Notifications and are
 * signed and dispatched by the `courier` crate. This page duplicates that
 * concept without the delivery behind it.
 *
 * The page component deliberately does not live under `src/pages/` — that
 * directory is still an active Pages Router root, so a file there would also be
 * served at its own bare path, outside this gate. See `users/page.tsx`.
 */
export default function WebhooksPage() {
    // Closed in a production build, and while demo data is on — an unfinished
    // page has no business in front of an audience. The gate is not a
    // tree-shake: do not put anything here that must not ship.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <Webhooks />;
}
