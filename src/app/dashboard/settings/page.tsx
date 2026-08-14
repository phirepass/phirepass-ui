import { notFound } from "next/navigation";

import { IS_DEV_MODE } from "@/lib/dev-mode";
import Settings from "@/pages/Settings";

export const dynamic = 'force-dynamic';

/**
 * Gated off in production alongside its menu entry; see the profile route for
 * why this 404s rather than redirecting.
 */
export default function SettingsPage() {
    if (!IS_DEV_MODE) {
        notFound();
    }

    return <Settings />;
}
