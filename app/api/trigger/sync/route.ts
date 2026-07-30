import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dueDatasets, syncDataset, type SyncOutcome } from "@/application/sync/sync-dataset";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { datasetTag, leadsTag } from "@/application/cache-tags";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:sync");

export const maxDuration = 300;

/**
 * n8n-triggered sync tick — the external-scheduler replacement for the removed
 * `GET /api/cron/sync` route (see docs/tech-debt.md's "no scheduled trigger"
 * entry). Processes the datasets whose adaptive interval is due, oldest-due
 * first, same as the route this replaces.
 *
 * `trigger: "cron"` is reused rather than adding a new `sync_trigger` enum
 * value — it already means "scheduled, not manual/webhook," which is exactly
 * what an n8n tick is, and a new enum value would need a migration for a label.
 */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    const ids = await dueDatasets(10);
    const outcomes: SyncOutcome[] = [];

    for (const id of ids) {
      const outcome = await syncDataset(id, "cron");
      outcomes.push(outcome);

      if (outcome.leadsCreated > 0 || outcome.itemsNew > 0) {
        revalidateTag(datasetTag(id), "max");
        revalidateTag(leadsTag(), "max");
      }
    }

    return NextResponse.json({ ok: true, processed: outcomes.length, outcomes });
  } catch (error) {
    log.error("sync tick failed", { error });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
