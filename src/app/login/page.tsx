import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyToken } from "@/app/lib/auth";
import Login from "@/pages/Login";

/**
 * Noindex: an auth form is thin, near-identical to the signup page, and of no
 * use as a search result — but it stays crawlable so the links to it are not
 * treated as broken.
 */
export const metadata: Metadata = {
    title: "Sign in",
    description: "Sign in to your Phirepass nodes, tunnels, and monitors.",
    robots: { index: false, follow: true },
    alternates: { canonical: "/login" },
};

export default async function LoginPage() {
    let authenticated: boolean;

    try {
        await verifyToken();
        authenticated = true;
    } catch {
        authenticated = false;
    }

    if (authenticated) {
        redirect("/dashboard/nodes");
    }

    return <Login />;
}
