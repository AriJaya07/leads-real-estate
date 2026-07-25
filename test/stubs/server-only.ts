/**
 * No-op stand-in for the `server-only` package.
 *
 * The real module throws on import to enforce the server/client boundary at
 * build time. Vitest has no such boundary, so importing it would fail every
 * test that touches a server module.
 */
export {};
