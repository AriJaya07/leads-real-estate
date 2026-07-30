import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/shared/constants";
import { serverEnv } from "@/shared/config/env";
import { type Role, isRole } from "@/domain/auth/permissions";

export interface SessionPayload {
  userId: string;
  email: string;
  role: Role;
  /** Compared against `users.sessionVersion` on every request — see application/auth/current-user.ts. */
  sessionVersion: number;
  /** The tenant this user belongs to — every query in application/ scopes by this. */
  companyId: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv().AUTH_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.sessionVersion !== "number" ||
      // No fallback for a missing/malformed companyId, unlike `role` below —
      // defaulting to a sentinel company would be a cross-tenant bug, not a
      // graceful degradation.
      typeof payload.companyId !== "string"
    ) {
      return null;
    }
    // Unrecognized/malformed role degrades to the lowest tier, never a
    // silent privilege grant — `currentUser()` re-verifies the real role
    // against the DB on every request anyway, so this only ever matters for
    // the brief window before that re-check runs.
    const role = typeof payload.role === "string" && isRole(payload.role) ? payload.role : "member";
    return {
      userId: payload.userId,
      email: payload.email,
      role,
      sessionVersion: payload.sessionVersion,
      companyId: payload.companyId,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Reads and verifies the session. Returns null when signed out. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
