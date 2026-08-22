import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that are withdrawn from the product for now.
 *
 * The header no longer links to them, and their page components call
 * `notFound()` — but the dashboard layout is a client component, so its shell
 * streams (and commits a 200) before the page ever runs, leaving the visitor
 * with a "Loading…" flash and a wrong status code. Catching them here settles
 * it before any rendering happens.
 *
 * Re-enabling one is: delete it from this list, drop the `notFound()` call in
 * its page, and restore its entry in Header.tsx.
 */
const WITHDRAWN_ROUTES = ["/dashboard/profile"];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (WITHDRAWN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
        // A redirect rather than a 404: these are shelved features, not secrets,
        // and a stale bookmark is better served by the node list than by an
        // error page.
        const target = new URL("/dashboard/nodes", request.url);
        return NextResponse.redirect(target);
    }

    return NextResponse.next();
}

export const config = {
    // Scoped tightly so no other request pays for this.
    matcher: ["/dashboard/profile/:path*"],
};
