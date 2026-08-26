'use client';

import { notFound } from 'next/navigation';

import ApiKeys from '@/components/api-keys/ApiKeys';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * API key management. Dev-gated: the keys and scopes shown come from
 * `mockApiKeys.ts`, and there is no public API for a key to authenticate
 * against — the server exposes no CRUD surface at all. Issuing something that
 * looks like a credential but authorises nothing is worse than not offering it.
 *
 * The page component deliberately does not live under `src/pages/` — that
 * directory is still an active Pages Router root, so a file there would also be
 * served at its own bare path, outside this gate. See `users/page.tsx`.
 */
export default function ApiKeysPage() {
    // Closed in a production build, and while demo data is on — an unfinished
    // page has no business in front of an audience. The gate is not a
    // tree-shake: do not put anything here that must not ship.
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <ApiKeys />;
}
