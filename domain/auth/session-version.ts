/**
 * Session revocation check. Pure on purpose, same reason `rate-limit.ts` is —
 * the JWT is stateless and would otherwise stay valid until its own expiry no
 * matter what happens to the account (password changed, session force-revoked).
 * Embedding a version in the token and comparing it against the current DB
 * value on every request is what makes a session revocable at all.
 */
export function isSessionRevoked(tokenVersion: number, currentVersion: number): boolean {
  return tokenVersion !== currentVersion;
}
