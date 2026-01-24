import crypto from "crypto";
import argon2 from "argon2";
import { CreatePATInput } from "./types";
import { query } from "./db";

const b64url = (buf: Buffer) => buf.toString("base64url");

export async function create_pat(input: CreatePATInput): Promise<string> {
    const tokenId = b64url(crypto.randomBytes(9));   // short public id
    const secret  = b64url(crypto.randomBytes(32));  // long secret

    const tokenHash = await argon2.hash(Buffer.from(secret, "utf8"), {
        type: argon2.argon2id,
        // Optional: set parameters explicitly if you want consistent cost across environments
        // timeCost: 2,
        // memoryCost: 19456,
        // parallelism: 1,
    });

    await query(
        `INSERT INTO pat_tokens (token_id, token_hash, name, user_id, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            tokenId,
            tokenHash,
            input.name,
            input.user_id,
            input.scopes,
            input.expires_at || null,
        ]
    );

    return `pat_${tokenId}.${secret}`;
}
