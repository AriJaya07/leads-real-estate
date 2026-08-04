"use client";

import { cn } from "@/lib/utils";

/**
 * Mirrors `MIN_PASSWORD_LENGTH` from `infrastructure/auth/password.ts`.
 * Duplicated rather than imported — that module is `server-only` (it pulls in
 * `node:crypto`) and can't be referenced from a client component.
 */
const MIN_LENGTH = 10;

/**
 * Purely cosmetic feedback for the three "set a password" flows (signup,
 * reset, accept-invite) — the doc pairs a strength meter with each of these
 * and calls out that reset/invite "reuse the password field and strength
 * meter above" from signup. Length-based only, since that's the only rule
 * the server actually enforces (`z.string().min(MIN_PASSWORD_LENGTH)`); it
 * never claims a rule the backend doesn't check.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const tier = password.length < MIN_LENGTH ? 0 : password.length < MIN_LENGTH + 5 ? 1 : 2;
  const label =
    tier === 0
      ? `Needs ${MIN_LENGTH}+ characters`
      : tier === 1
        ? `Good — ${MIN_LENGTH}+ characters`
        : "Strong";

  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("h-[3px] flex-1 rounded-full", i <= tier ? "bg-brand" : "bg-muted")} />
        ))}
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </div>
  );
}
