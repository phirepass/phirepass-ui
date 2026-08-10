/**
 * Feature gate for surfaces that are not ready for production yet.
 *
 * `NODE_ENV` is inlined by Next at build time, so this constant is statically
 * `false` in a production bundle and the gated UI is tree-shaken out rather than
 * merely hidden. The API routes behind those surfaces repeat the check on the
 * server (see `assertDevMode`), because a client-side gate is a UI affordance,
 * not an access control.
 */
export const IS_DEV_MODE = process.env.NODE_ENV !== "production";
