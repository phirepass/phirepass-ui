/**
 * ⚠️ TEMPORARY — DELETE THIS FILE ON THE NEXT UI DEPLOYMENT ⚠️
 *
 * Next calls `register` once per server instance, before the first request is
 * served. The only thing here is the one-off creation of the two-factor tables
 * on a database that predates them; see `src/app/lib/mfa-schema.ts` for what it
 * does and when to take both files out.
 *
 * Node-only: `register` runs in the Edge runtime too, where `pg` cannot.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    // No tables where the feature is off. Turning NEXT_PUBLIC_MFA_ENABLED on
    // creates them at the next start, which is the same one-off this is.
    const { IS_MFA_ENABLED } = await import("./lib/mfa-feature.ts");
    if (!IS_MFA_ENABLED) return;

    const { ensureMfaSchema } = await import("./app/lib/mfa-schema.ts");
    await ensureMfaSchema();
}
