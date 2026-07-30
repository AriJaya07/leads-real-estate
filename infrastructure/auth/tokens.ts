import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Shared by the invite and password-reset flows: both hand a high-entropy
 * random token to the recipient over email and store only its hash, same
 * reasoning as never storing a plaintext password. A plain sha256 (not
 * scrypt) is deliberate here — the input is already 256 bits of randomness,
 * not a human-guessable secret, so there's nothing for a slow hash to defend
 * against; a fast digest just needs to make the stored value unusable to
 * whoever might read the database.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
