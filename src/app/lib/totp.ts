import crypto from "node:crypto";

/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), on `node:crypto`.
 *
 * Hand-rolled for the same reason the JWT next door is: the algorithm is a
 * HMAC, a counter and a modulo, and the whole of it fits in this file with the
 * parameter choices visible. A library would hide exactly the three numbers
 * that decide whether an authenticator app interoperates — SHA1, 6 digits, a
 * 30-second step — behind defaults that are theirs to change.
 *
 * Those three are not preferences. Google Authenticator, 1Password, Aegis and
 * the rest ignore the `algorithm`/`digits`/`period` parameters of an `otpauth:`
 * URI often enough that anything other than this triple is a support problem,
 * so they are constants here rather than options.
 */

/** RFC 6238's default, and the only step any authenticator reliably honours. */
export const STEP_SECONDS = 30;

/** Code length. Six is what every authenticator renders. */
const DIGITS = 6;

/**
 * How many steps either side of "now" still verify.
 *
 * One step is ±30s, which covers the phone whose clock has drifted and the
 * person who starts typing as the code is about to roll. Widening it buys very
 * little usability and multiplies the number of codes a guess can hit, so the
 * replay guard in `mfa.ts` — which refuses a step that has already been used —
 * is what makes even this window safe.
 */
export const DEFAULT_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 base32, unpadded and uppercase.
 *
 * Authenticators read the secret out of the URI's `secret=` parameter and every
 * one of them expects base32; padding is tolerated by most and rejected by
 * some, so none is emitted.
 */
export function base32Encode(bytes: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = "";

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;

        while (bits >= 5) {
            out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return out;
}

/**
 * The inverse, forgiving about how a person retyped the secret: padding,
 * spaces, and the lowercase an authenticator's "enter key manually" screen
 * hands back are all accepted. Anything else throws, because a silently
 * mis-decoded secret produces codes that never match and no clue why.
 */
export function base32Decode(input: string): Buffer {
    const normalized = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");

    let bits = 0;
    let value = 0;
    const out: number[] = [];

    for (const char of normalized) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) {
            throw new Error("Invalid base32 character");
        }

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    return Buffer.from(out);
}

/**
 * A fresh shared secret, as base32.
 *
 * 20 bytes is RFC 4226's recommendation and the size HMAC-SHA1's block
 * structure is happiest with — 160 bits, matching the digest.
 */
export function generateSecret(): string {
    return base32Encode(crypto.randomBytes(20));
}

/** The step number a moment falls in. Exported because the replay guard stores it. */
export function stepFor(atMs: number = Date.now()): number {
    return Math.floor(atMs / 1000 / STEP_SECONDS);
}

/**
 * The HOTP value for one counter, as a zero-padded 6-digit string.
 *
 * The counter goes in as a big-endian 64-bit integer; `writeBigUInt64BE` keeps
 * that exact past 2^53, which a `number` would not.
 */
export function codeForStep(secretBase32: string, step: number): string {
    const key = base32Decode(secretBase32);

    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));

    const digest = crypto.createHmac("sha1", key).update(counter).digest();

    // Dynamic truncation, RFC 4226 §5.3: the low nibble of the last byte picks
    // where in the digest the 31-bit value is read from.
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);

    return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Whether a string could be a code at all, before any crypto is done. */
export function isWellFormedCode(input: unknown): input is string {
    return typeof input === "string" && /^\d{6}$/.test(input.replace(/\s+/g, ""));
}

/** Digits only — authenticators and password managers paste with spaces in. */
export function normalizeCode(input: string): string {
    return input.replace(/\s+/g, "");
}

/**
 * Verifies a submitted code, returning the step it matched, or `null`.
 *
 * The **step** rather than a boolean because the caller has to remember it: a
 * code stays valid for the whole of its step, so without recording which step
 * was spent, a code read over someone's shoulder can be replayed for the rest
 * of its 30 seconds. `mfa.ts` persists the returned step and refuses anything
 * at or below it.
 *
 * Every candidate step is compared even after one matches, so the time taken
 * does not reveal how far off the submitted code was.
 */
export function verifyCode(
    secretBase32: string,
    submitted: string,
    options: { window?: number; atMs?: number } = {},
): number | null {
    const code = normalizeCode(submitted);
    if (!isWellFormedCode(code)) return null;

    const window = options.window ?? DEFAULT_WINDOW;
    const current = stepFor(options.atMs);

    let matched: number | null = null;
    for (let offset = -window; offset <= window; offset += 1) {
        const step = current + offset;
        if (step < 0) continue;

        const expected = codeForStep(secretBase32, step);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code)) && matched === null) {
            matched = step;
        }
    }

    return matched;
}

/**
 * The `otpauth:` URI an authenticator scans.
 *
 * The label is `Issuer:account` *and* `issuer=` is repeated as a parameter —
 * belt and braces, because older apps read only the label and newer ones only
 * the parameter, and an entry that says just an email address is useless in a
 * list of thirty.
 */
export function otpauthUri({
    secret,
    account,
    issuer,
}: {
    secret: string;
    account: string;
    issuer: string;
}): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: "SHA1",
        digits: String(DIGITS),
        period: String(STEP_SECONDS),
    });

    return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * The secret grouped into fours, for the "can't scan it?" line.
 *
 * Nothing reads it back — `base32Decode` strips whitespace — it is purely so a
 * 32-character string can be typed into a phone without losing your place.
 */
export function formatSecretForDisplay(secret: string): string {
    return secret.replace(/(.{4})/g, "$1 ").trim();
}
