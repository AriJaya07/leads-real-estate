import "server-only";
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "drk_live_";
const DISPLAY_PREFIX_LENGTH = 13;

/** `drk_live_` + 18 random bytes hex — the format the API-keys mock UI already established. */
export function generateApiKeySecret(): string {
  return `${KEY_PREFIX}${randomBytes(18).toString("hex")}`;
}

/**
 * Deterministic sha256, not `hashPassword`'s salted/slow scrypt
 * (`infrastructure/auth/password.ts`). A password hash defends one login
 * attempt at a time against guessing; this defends a lookup among many
 * stored keys via an indexed `WHERE key_hash = $1` — there's no plaintext to
 * protect against offline guessing since a `drk_live_` secret is already
 * 144 bits of randomness, and a slow hash would just tax every API request.
 */
export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** First chars of the secret for display only, e.g. `drk_live_8fa2c91b…`. */
export function displayPrefix(secret: string): string {
  return `${secret.slice(0, DISPLAY_PREFIX_LENGTH)}…`;
}
