'use client';

import { notFound } from 'next/navigation';

import RateLimiting from '@/components/rate-limiting/RateLimiting';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * Rate-limiting policy. Dev-gated: nothing on this page is enforced anywhere.
 * The server applies no rate limiting today (PLAN.md P03 tracks the real work on
 * the unauthenticated auth endpoints).
 *
 * The page component deliberately does not live under `src/pages/` — that
 * directory is still an active Pages Router root, so a file there would also be
 * served at its own bare path, outside this gate. See `users/page.tsx`.
 */
export default function RateLimitingPage() {
    // Closed in a production build, and while demo data is on — an unfinished
    // page has no business in front of an audience. The gate is not a
    // tree-shake: do not put anything here that must not ship.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <RateLimiting />;
}
