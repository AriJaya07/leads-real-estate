import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { discoverAllSources } from "@/application/sync/discovery";
import { syncDataset } from "@/application/sync/sync-dataset";
import { secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { datasetTag, leadsTag } from "@/application/cache-tags";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("webhook:apify");

/**
 * Webhook accelerant — *not* the primary change signal.
 *
 * n8n pushes items into named Apify datasets via the Dataset API rather than by
 * running an actor, so a "Run Succeeded" webhook never fires for that traffic.
 * The poller in /api/cron/sync is what guarantees delivery; this endpoint only
 * shortens the latency when a webhook does arrive, and a missed delivery costs
 * one poll cycle rather than the data.
 */
export async function POST(request: Request) {
  const provided =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer /, "");

  if (!secretsMatch(provided, serverEnv().APIFY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    resource?: { defaultDatasetId?: string };
    eventData?: { actorRunId?: string };
  };
  const externalId = body.resource?.defaultDatasetId ?? null;

  // Respond immediately; Apify retries on slow responses and the sync can take
  // considerably longer than a webhook timeout.
  after(async () => {
    try {
      if (externalId) {
        const [dataset] = await db()
          .select({ id: schema.datasets.id })
          .from(schema.datasets)
          .where(eq(schema.datasets.externalId, externalId))
          .limit(1);

        if (dataset) {
          const outcome = await syncDataset(dataset.id, "webhook", { force: true });
          if (outcome.itemsNew > 0) {
            revalidateTag(datasetTag(dataset.id), "max");
            revalidateTag(leadsTag(), "max");
          }
          return;
        }
      }
      // Unknown dataset — discovery will register it, and the next tick syncs it.
      await discoverAllSources();
    } catch (error) {
      log.error("background work failed", { error, externalId });
    }
  });

  return NextResponse.json({ ok: true, accepted: externalId ?? "discovery" });
}
