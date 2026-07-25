import "server-only";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// `promisify` picks the overload without options, so the signature is restated.
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

/** OWASP-recommended scrypt parameters. Raised over the Node defaults. */
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const PREFIX = "scrypt";

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Format: `scrypt$<salt-hex>$<hash-hex>`. Self-describing so the parameters can
 * be raised later without invalidating existing hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== PREFIX || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length,
    SCRYPT_OPTIONS,
  );

  // Constant-time: a plain === leaks the hash one byte at a time via timing.
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/**
 * Burns roughly the same time as a real verification. Without this, a missing
 * account returns noticeably faster than a wrong password, which turns the login
 * form into an "is this person on the team?" oracle.
 */
export async function fakeVerify(): Promise<void> {
  await scrypt("dummy", randomBytes(16), KEY_LENGTH, SCRYPT_OPTIONS);
}

export function generateTemporaryPassword(): string {
  // Base64url over 12 bytes: 16 chars, well past the minimum length.
  return randomBytes(12).toString("base64url");
}
