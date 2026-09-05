/**
 * Whether this deployment offers two-factor authentication.
 *
 * On in production, off everywhere else, and overridable either way with
 * `NEXT_PUBLIC_MFA_ENABLED`.
 *
 * The default follows the deployment rather than the flag so that neither
 * mistake is possible: a production release cannot lose its second factor
 * because someone forgot an environment variable, and a local checkout does not
 * demand an authenticator app before it will let you at the dashboard.
 *
 * `NEXT_PUBLIC_` because both halves have to agree. The server decides whether
 * sign-in asks for a code and whether the endpoints exist; the browser decides
 * whether Settings offers to turn it on. Two flags would eventually disagree,
 * and the disagreement would read as "the Turn on button is broken". Being
 * public costs nothing — a feature flag is not a secret, and its state is
 * plainly visible in whether the app asks for a code.
 *
 * The prefix alone is not enough for the browser, though. Next inlines
 * `NEXT_PUBLIC_*` at **build** time, and the production image is built once in
 * CI and then run with whatever `docker-compose` sets — so a flag flipped in
 * the compose file would move the server and leave the bundle on last build's
 * answer. That is what `/api/config` exists for in this app, and why the client
 * asks `mfaEnabledFromConfig` rather than reading the constant below.
 */

const TRUTHY = new Set(["true", "1", "on", "yes"]);
const FALSY = new Set(["false", "0", "off", "no"]);

/**
 * Both parameters are injected rather than read here so this is testable and so
 * the client can pass its own build-time `NODE_ENV`, which Next inlines.
 */
export function mfaEnabledFor(flag: string | undefined, isProduction: boolean): boolean {
    const normalized = flag?.trim().toLowerCase();

    if (normalized && TRUTHY.has(normalized)) return true;
    if (normalized && FALSY.has(normalized)) return false;

    return isProduction;
}

/**
 * The answer for this process.
 *
 * Authoritative on the server, which reads the real environment on every boot.
 * In the browser it is only the build's guess — use `mfaEnabledFromConfig`
 * there.
 */
export const IS_MFA_ENABLED = mfaEnabledFor(
    process.env.NEXT_PUBLIC_MFA_ENABLED,
    process.env.NODE_ENV === "production",
);

/**
 * The browser's answer, from the runtime config `/api/config` serves.
 *
 * Same function, same defaulting; the only difference is that the flag comes
 * from the running deployment rather than from whenever the image was built.
 */
export function mfaEnabledFromConfig(config: {
    NEXT_PUBLIC_MFA_ENABLED?: string;
}): boolean {
    return mfaEnabledFor(
        config.NEXT_PUBLIC_MFA_ENABLED,
        process.env.NODE_ENV === "production",
    );
}

/**
 * Server-side gate for the 2FA endpoints, in the shape `devModeGate` uses.
 *
 * 404 rather than 403, and before authentication, so a deployment with the
 * feature off is indistinguishable from one built before it existed.
 */
export function mfaGate(): Response | null {
    if (IS_MFA_ENABLED) return null;

    return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
    });
}
