'use client';

import { notFound } from 'next/navigation';

import PipelinesPage from '@/components/pipelines/PipelinesPage';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * Scheduled work across the fleet. Dev-gated for now because there is nothing
 * behind it: no scheduler, no runner, no API — the page is the design of the
 * feature, and a schedule that is displayed but never fires is worse than one
 * that is not offered.
 *
 * As with Servers, the page component deliberately does not live under
 * `src/pages/` — that directory is still an active Pages Router root, so a file
 * there would also be served at `/Pipelines`, outside this gate.
 */
export default function Page() {
    // Closed in a production build, and while demo data is on. The gate is a UI
    // affordance, not access control: once the routes exist they repeat the
    // check server-side via `devModeGate`.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <PipelinesPage />;
}
