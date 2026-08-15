import { notFound } from "next/navigation";

import Profile from "@/pages/Profile";

export const dynamic = 'force-dynamic';

/**
 * Withdrawn for now: the route always 404s and the header no longer links to
 * it — src/proxy.ts turns the request away first, and this is the
 * backstop. The page component below is kept intact so re-enabling is a matter
 * of undoing both plus the menu entry in Header.tsx.
 */
export default function ProfilePage() {
    notFound();

    return <Profile />;
}
