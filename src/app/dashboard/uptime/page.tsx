'use client';

import { notFound } from 'next/navigation';

import UptimePage from '@/components/uptime/UptimePage';
import { IS_DEV_MODE } from '@/lib/dev-mode';

export const dynamic = 'force-dynamic';

/**
 * The page component deliberately does not live under `src/pages/` — that
 * directory is still an active Pages Router root, so a file there would also be
 * served at `/Uptime`, outside this dev gate.
 */
export default function Page() {
    // Statically false in a production bundle, so the page and everything it
    // imports drops out of that build rather than merely being unreachable.
    if (!IS_DEV_MODE) {
        notFound();
    }

    return <UptimePage />;
}
