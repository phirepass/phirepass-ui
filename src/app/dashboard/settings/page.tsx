import type { Metadata } from "next";

import SettingsPage from "@/components/settings/SettingsPage";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: "Settings",
};

/**
 * The page component lives in `src/components/settings/`, not `src/pages/` —
 * that directory is still an active Pages Router root, so a file there would
 * also be served at `/Settings`, as a second uncontrolled entry point.
 */
export default function Page() {
    return <SettingsPage />;
}
