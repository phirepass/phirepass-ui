import { notFound } from "next/navigation";

import { IS_DEV_MODE } from "@/lib/dev-mode";
import Profile from "@/pages/Profile";

export const dynamic = 'force-dynamic';

/**
 * Gated off in production alongside its menu entries. 404 rather than a
 * redirect, matching `devModeGate`, so the route is indistinguishable from one
 * that was never deployed.
 */
export default function ProfilePage() {
    if (!IS_DEV_MODE) {
        notFound();
    }

    return <Profile />;
}
