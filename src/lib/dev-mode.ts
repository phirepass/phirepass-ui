/**
 * Feature gate for surfaces that are not ready for production yet.
 *
 * `NODE_ENV` is inlined by Next at build time, so this constant is statically
 * `false` in a production bundle and the gated UI is tree-shaken out rather than
 * merely hidden. The API routes behind those surfaces repeat the check on the
 * server (see `devModeGate`), because a client-side gate is a UI affordance,
 * not an access control.
 */
export const IS_DEV_MODE = process.env.NODE_ENV !== "production";

/**
 * Server-side half of the gate, for routes behind a dev-only surface.
 *
 * Returns a 404 when the feature is gated off and `null` when the caller may
 * proceed, so a route reads:
 *
 * ```ts
 * const gate = devModeGate();
 * if (gate) return gate;
 * ```
 *
 * 404 rather than 403, and checked *before* authentication, so a gated route is
 * indistinguishable from one that was never deployed — answering 401 would
 * confirm the endpoint exists.
 */
export function devModeGate(): Response | null {
    if (IS_DEV_MODE) {
        return null;
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
    });
}
