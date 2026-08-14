import type { Metadata } from "next";

import Signup from "@/pages/Signup";

/** Noindex for the same reason as the login page. */
export const metadata: Metadata = {
    title: "Create account",
    description: "Create a Phirepass account to connect your first node.",
    robots: { index: false, follow: true },
    alternates: { canonical: "/signup" },
};

export default function SignupPage() {
    return <Signup />;
}
