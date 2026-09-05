import crypto from "node:crypto";

import { query } from "./db.ts";
import { getRedisClient } from "./redis.ts";
import {
    generateSecret,
    normalizeCode,
    otpauthUri,
    verifyCode,
} from "./totp.ts";

/**
 * Everything two-factor authentication touches that is not the algorithm
 * itself: where the secret is kept, how recovery codes are minted and spent,
 * and the two limits — replay and rate — that stand between a six-digit number
 * and an account.
 *
 * The algorithm lives next door in `totp.ts` and knows nothing about the
 * database; this file knows nothing about HMAC.
 */

/** What an authenticator app shows above the code. */
const ISSUER = "PhirePass";

/** How many recovery codes a batch holds. Ten is the industry's silent standard. */
const RECOVERY_CODE_COUNT = 10;

/**
 * Recovery code alphabet: base32 without the four characters that get misread
 * off a printout — I, L, O and 0/1. Ten characters of it is ~50 bits, which is
 * far past anything guessable and still short enough to type twice.
 */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_LENGTH = 10;

/** Failed attempts allowed before the account stops answering, and for how long. */
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

export type MfaStatus = {
    /** A confirmed authenticator: sign-in asks for a code. */
    enabled: boolean;
    /** A secret exists but no code has been proved against it yet. */
    pending: boolean;
    enabled_at: string | null;
    last_used_at: string | null;
    recovery_codes_remaining: number;
};

export type VerifyOutcome = "ok" | "invalid" | "replayed" | "locked" | "not_enrolled";

// ─────────────────────────────────────────────────────────────────────────────
// Secret storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The key the TOTP secret is encrypted under, derived from `JWT_SECRET`.
 *
 * Deriving rather than adding an env var is a deliberate trade. The upside is
 * that 2FA needs no new credential in any deployment — the same secret that
 * already signs sessions protects the authenticator secrets, and there is no
 * install where someone forgot to set the second one and the column quietly
 * holds plaintext.
 *
 * The cost is that rotating `JWT_SECRET` makes existing authenticators
 * undecryptable. That rotation already signs everyone out, and the recovery
 * codes survive it (they are hashed, not encrypted), so the way back is the way
 * back from a lost phone — but it is a real consequence and worth knowing
 * before rotating.
 *
 * HKDF, not the raw secret: the signing key and the encryption key must not be
 * the same bytes, and `info` is what keeps them apart.
 */
function encryptionKey(): Buffer {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not set");
    }

    return Buffer.from(
        crypto.hkdfSync(
            "sha256",
            Buffer.from(secret, "utf8"),
            // A fixed salt. The entropy that matters is in `JWT_SECRET`; a
            // per-row salt would have to be stored beside the ciphertext and
            // would buy nothing, since every row is already keyed identically.
            Buffer.from("phirepass:mfa", "utf8"),
            Buffer.from("totp-secret-encryption:v1", "utf8"),
            32,
        ),
    );
}

/**
 * AES-256-GCM, stored as `v1.<iv>.<tag>.<ciphertext>` in base64url.
 *
 * Authenticated encryption rather than plain AES so a row that was tampered
 * with fails loudly instead of decrypting to a secret that generates wrong
 * codes forever. The version prefix is what lets a future scheme read old rows.
 */
export function encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
        "v1",
        iv.toString("base64url"),
        tag.toString("base64url"),
        ciphertext.toString("base64url"),
    ].join(".");
}

export function decryptSecret(stored: string): string {
    const [version, ivPart, tagPart, ciphertextPart] = stored.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) {
        throw new Error("Unrecognised MFA secret encoding");
    }

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, "base64url")),
        decipher.final(),
    ]).toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery codes
// ─────────────────────────────────────────────────────────────────────────────

/** One code, hyphenated in the middle so the eye can hold it while typing. */
function generateRecoveryCode(): string {
    const chars = Array.from(crypto.randomBytes(RECOVERY_CODE_LENGTH), (byte) =>
        // Modulo bias against a 31-character alphabet is a fraction of a bit out
        // of 50, which changes nothing that matters here.
        RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
    ).join("");

    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
    return Array.from({ length: count }, generateRecoveryCode);
}

/**
 * The form a code is compared in: uppercase, no hyphen, no spaces — so a code
 * typed back the way it was printed, and one pasted out of a password manager
 * that stripped the punctuation, are the same code.
 */
export function normalizeRecoveryCode(input: string): string {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
    return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Shape check, before a malformed string reaches the database. */
export function isWellFormedRecoveryCode(input: unknown): input is string {
    return (
        typeof input === "string" &&
        normalizeRecoveryCode(input).length === RECOVERY_CODE_LENGTH
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

function attemptKey(userId: string): string {
    return `mfa:attempts:${userId}`;
}

/**
 * Whether this account has attempts left, counting the one about to happen.
 *
 * Fails **open** when Redis is unavailable, and says so in the log. The closed
 * alternative is that a cache outage locks every 2FA account out of the
 * product — a worse and far more likely failure than the guessing run this
 * defends against, which still needs on the order of 10^5 tries at a code that
 * changes every 30 seconds, through a relay that rate-limits connections of its
 * own.
 */
async function withinAttemptBudget(userId: string): Promise<boolean> {
    try {
        const redis = await getRedisClient();
        if (!redis) return true;

        const count = await redis.incr(attemptKey(userId));
        if (count === 1) {
            await redis.expire(attemptKey(userId), ATTEMPT_WINDOW_SECONDS);
        }

        return count <= MAX_ATTEMPTS;
    } catch (e) {
        console.warn("[mfa] attempt budget check failed", e);
        return true;
    }
}

/** Clears the counter after a correct code, so a fumbled evening is not punished. */
async function clearAttempts(userId: string): Promise<void> {
    try {
        const redis = await getRedisClient();
        if (!redis) return;
        await redis.del(attemptKey(userId));
    } catch (e) {
        console.warn("[mfa] attempt reset failed", e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

type MfaRow = {
    user_id: string;
    secret: string;
    confirmed_at: string | null;
    last_step: string | number | null;
    last_used_at: string | null;
};

async function getRow(userId: string): Promise<MfaRow | null> {
    const result = await query(
        `SELECT user_id, secret, confirmed_at, last_step, last_used_at
           FROM user_mfa
          WHERE user_id = $1`,
        [userId],
    );

    return (result.rows[0] as MfaRow | undefined) ?? null;
}

/**
 * Whether sign-in must ask this account for a code.
 *
 * The one question the login flow asks, kept to a single indexed lookup because
 * every sign-in pays for it.
 */
export async function isMfaEnabled(userId: string): Promise<boolean> {
    const result = await query(
        `SELECT 1 FROM user_mfa WHERE user_id = $1 AND confirmed_at IS NOT NULL`,
        [userId],
    );

    return (result.rowCount ?? 0) > 0;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
    const row = await getRow(userId);

    const remaining = await query(
        `SELECT count(*)::int AS remaining
           FROM user_mfa_recovery_codes
          WHERE user_id = $1 AND used_at IS NULL`,
        [userId],
    );

    return {
        enabled: Boolean(row?.confirmed_at),
        pending: Boolean(row) && !row?.confirmed_at,
        enabled_at: row?.confirmed_at ?? null,
        last_used_at: row?.last_used_at ?? null,
        recovery_codes_remaining: remaining.rows[0]?.remaining ?? 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrolment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mints a secret and returns what the enrolment screen needs to draw.
 *
 * Replaces any unconfirmed row: someone who opened the dialog, wandered off and
 * came back should get a working QR code, not one that no longer matches what
 * the server holds. A **confirmed** row is not touched — turning 2FA off is its
 * own deliberate action, and silently reissuing here would let a stolen session
 * quietly swap the authenticator for its own.
 */
export async function beginEnrollment(
    userId: string,
    account: string,
): Promise<{ secret: string; uri: string }> {
    if (await isMfaEnabled(userId)) {
        throw new Error("MFA is already enabled");
    }

    const secret = generateSecret();

    await query(
        `INSERT INTO user_mfa (user_id, secret, confirmed_at, last_step, updated_at)
              VALUES ($1, $2, NULL, NULL, now())
         ON CONFLICT (user_id) DO UPDATE
                SET secret = EXCLUDED.secret,
                    confirmed_at = NULL,
                    last_step = NULL,
                    updated_at = now()`,
        [userId, encryptSecret(secret)],
    );

    return { secret, uri: otpauthUri({ secret, account, issuer: ISSUER }) };
}

/**
 * Turns the pending secret into a live one, on proof of a correct code.
 *
 * Returns the recovery codes, which is the only time they exist in readable
 * form — the database keeps digests, so a person who loses this list has to
 * regenerate rather than be reminded.
 */
export async function completeEnrollment(
    userId: string,
    submitted: string,
): Promise<{ outcome: VerifyOutcome; recoveryCodes?: string[] }> {
    const row = await getRow(userId);
    if (!row) return { outcome: "not_enrolled" };
    if (row.confirmed_at) return { outcome: "not_enrolled" };

    if (!(await withinAttemptBudget(userId))) {
        return { outcome: "locked" };
    }

    const step = verifyCode(decryptSecret(row.secret), submitted);
    if (step === null) return { outcome: "invalid" };

    await query(
        `UPDATE user_mfa
            SET confirmed_at = now(), last_step = $2, last_used_at = now(), updated_at = now()
          WHERE user_id = $1`,
        [userId, step],
    );

    const recoveryCodes = await issueRecoveryCodes(userId);
    await clearAttempts(userId);

    return { outcome: "ok", recoveryCodes };
}

/**
 * Replaces the batch of recovery codes.
 *
 * The old ones are deleted rather than marked spent: they are no longer a
 * record of anything, and leaving them would make "codes remaining" count
 * strings nobody holds.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes();

    await query(`DELETE FROM user_mfa_recovery_codes WHERE user_id = $1`, [userId]);
    await query(
        `INSERT INTO user_mfa_recovery_codes (user_id, code_hash)
              SELECT $1, unnest($2::text[])`,
        [userId, codes.map(hashRecoveryCode)],
    );

    return codes;
}

/** Switches 2FA off entirely. The secret is deleted, not disabled. */
export async function disableMfa(userId: string): Promise<void> {
    await query(`DELETE FROM user_mfa_recovery_codes WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM user_mfa WHERE user_id = $1`, [userId]);
    await clearAttempts(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks a code from an enrolled account, and spends the step it matched.
 *
 * The `last_step` guard is in the UPDATE's WHERE clause rather than read first
 * and compared in JS, so two requests arriving with the same code in the same
 * 30 seconds cannot both find the step unspent — Postgres serialises them and
 * exactly one row is affected.
 */
export async function verifyTotpForUser(
    userId: string,
    submitted: string,
): Promise<VerifyOutcome> {
    const row = await getRow(userId);
    if (!row || !row.confirmed_at) return "not_enrolled";

    if (!(await withinAttemptBudget(userId))) return "locked";

    const step = verifyCode(decryptSecret(row.secret), submitted);
    if (step === null) return "invalid";

    const spent = await query(
        `UPDATE user_mfa
            SET last_step = $2, last_used_at = now(), updated_at = now()
          WHERE user_id = $1
            AND (last_step IS NULL OR last_step < $2)`,
        [userId, step],
    );

    if (spent.rowCount === 0) return "replayed";

    await clearAttempts(userId);
    return "ok";
}

/**
 * Spends a recovery code, if it is one of this account's unused ones.
 *
 * Marked used in the same statement that finds it, for the same
 * one-winner-only reason as the step guard above.
 */
export async function consumeRecoveryCode(
    userId: string,
    submitted: string,
): Promise<VerifyOutcome> {
    if (!(await isMfaEnabled(userId))) return "not_enrolled";
    if (!isWellFormedRecoveryCode(submitted)) return "invalid";
    if (!(await withinAttemptBudget(userId))) return "locked";

    const spent = await query(
        `UPDATE user_mfa_recovery_codes
            SET used_at = now()
          WHERE user_id = $1
            AND code_hash = $2
            AND used_at IS NULL`,
        [userId, hashRecoveryCode(submitted)],
    );

    if (spent.rowCount === 0) return "invalid";

    await query(
        `UPDATE user_mfa SET last_used_at = now(), updated_at = now() WHERE user_id = $1`,
        [userId],
    );
    await clearAttempts(userId);

    return "ok";
}

/** Either kind of second factor, chosen by the shape of what was submitted. */
export async function verifySecondFactor(
    userId: string,
    submitted: string,
): Promise<VerifyOutcome> {
    const asCode = normalizeCode(submitted);
    if (/^\d{6}$/.test(asCode)) {
        return verifyTotpForUser(userId, asCode);
    }

    return consumeRecoveryCode(userId, submitted);
}
