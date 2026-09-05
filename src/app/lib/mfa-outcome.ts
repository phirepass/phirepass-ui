import { json_response } from "./framework.ts";
import type { VerifyOutcome } from "./mfa.ts";

/**
 * One translation of a verification result into a response, shared by every
 * endpoint that checks a code.
 *
 * Kept in one place because the wording is part of the security design, not
 * decoration: "that code has already been used" tells the person their
 * authenticator is fine and they merely typed a code twice, while a bare
 * "invalid" would send them into re-enrolling. The one thing no message says is
 * whether the account has 2FA at all — that answer is the same 400 as a wrong
 * code, since the sign-in prompt is reachable before a session exists.
 */
export function outcomeResponse(outcome: Exclude<VerifyOutcome, "ok">) {
    switch (outcome) {
        case "locked":
            return json_response(
                {
                    error: "Too many attempts. Wait a few minutes and try again.",
                    outcome,
                },
                429,
            );
        case "replayed":
            return json_response(
                {
                    error: "That code has already been used. Wait for the next one.",
                    outcome,
                },
                400,
            );
        case "not_enrolled":
        case "invalid":
        default:
            return json_response(
                { error: "That code is not right. Check your authenticator and try again.", outcome: "invalid" },
                400,
            );
    }
}

/** The submitted code, or `null` when the body was not a usable shape. */
export function readSubmittedCode(body: unknown): string | null {
    if (typeof body !== "object" || body === null) return null;

    const code = (body as { code?: unknown }).code;
    if (typeof code !== "string") return null;

    const trimmed = code.trim();
    // Long enough for a recovery code with punctuation, short enough that no
    // hashing or decryption work is done on a megabyte of nonsense.
    if (trimmed.length === 0 || trimmed.length > 64) return null;

    return trimmed;
}

/**
 * Whether a thrown error is "no usable session" rather than a fault.
 *
 * `verifyToken` signals both by throwing, and the difference decides between
 * 401 and 500 — a browser whose cookie expired mid-dialog should be told to
 * sign in again, not shown a server error. The strings are the ones `auth.ts`
 * throws; anything else is a real failure and keeps its 500.
 */
const AUTH_FAILURES = new Set([
    "Token not found",
    "Invalid token",
    "Invalid token payload",
    "User not found",
]);

export function isAuthFailure(e: unknown): boolean {
    return e instanceof Error && AUTH_FAILURES.has(e.message);
}

/** The response for a request that arrived without a usable session. */
export function unauthorizedResponse() {
    return json_response({ error: "Unauthorized" }, 401);
}
