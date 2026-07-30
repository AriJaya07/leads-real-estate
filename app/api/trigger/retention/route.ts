import { NextResponse } from "next/server";
import { pruneOldRows } from "@/application/maintenance/prune-old-rows";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:retention");

/**
 * n8n-triggered retention pruning — the external-scheduler replacement for the
 * removed `GET /api/cron/retention` route (see docs/tech-debt.md's "no
 * scheduled trigger" entry). Unlike the other three trigger routes,
 * `pruneOldRows()` has no internal try/catch of its own, so a DB error here
 * would otherwise throw straight past this route uncaught.
 */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    const result = await pruneOldRows();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    log.error("retention pruning failed", { error });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
