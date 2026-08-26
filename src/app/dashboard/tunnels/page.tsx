'use client';

import { notFound } from 'next/navigation';

import Tunnels from '@/components/tunnels/Tunnels';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * Tunnel management. Dev-gated: the tunnels listed here come from `mockTunnels.ts`,
 * and the shareable-link capability the page implies does not exist yet (ROADMAP C2).
 *
 * The page component deliberately does not live under `src/pages/` — that
 * directory is still an active Pages Router root, so a file there would also be
 * served at its own bare path, outside this gate. See `users/page.tsx`.
 */
export default function TunnelsPage() {
    // Closed in a production build, and while demo data is on — an unfinished
    // page has no business in front of an audience. The gate is not a
    // tree-shake: do not put anything here that must not ship.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <Tunnels />;
}
