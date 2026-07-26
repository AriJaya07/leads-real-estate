import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret comparison. A plain `!==` leaks the shared secret one
 * byte at a time to anyone willing to measure response times.
 */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
