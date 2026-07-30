import { NextResponse } from "next/server";
import { discoverAllSources } from "@/application/sync/discovery";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:discover");

export const maxDuration = 300;

/**
 * n8n-triggered dataset discovery — the external-scheduler replacement for the
 * removed `GET /api/cron/discover` route (see docs/tech-debt.md's "no scheduled
 * trigger" entry). `discoverAllSources()` is internally non-throwing per source,
 * but this still guards the call since a hard infra failure (e.g. DB down) is
 * not caught inside it.
 */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    const results = await discoverAllSources();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    log.error("discovery failed", { error });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
