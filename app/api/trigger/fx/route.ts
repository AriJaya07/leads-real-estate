import { NextResponse } from "next/server";
import { refreshFxRates } from "@/application/fx/refresh-fx-rates";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:fx");

/**
 * n8n-triggered FX refresh — the external-scheduler replacement for the removed
 * `GET /api/cron/fx` route (see docs/tech-debt.md's "no scheduled trigger"
 * entry). `refreshFxRates()` already degrades gracefully on its own (a failed
 * refresh leaves existing rates untouched), so this route's try/catch only
 * guards against something refreshFxRates itself can't anticipate.
 */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    const result = await refreshFxRates();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    log.error("fx refresh failed", { error });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
