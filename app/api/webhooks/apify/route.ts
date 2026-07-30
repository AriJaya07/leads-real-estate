import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { discoverAllSources } from "@/application/sync/discovery";
import { syncDataset } from "@/application/sync/sync-dataset";
import { completeScrapeRequest } from "@/application/collection/complete-scrape-request";
import { secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { datasetTag, leadsTag, scrapeRequestsTag } from "@/application/cache-tags";
import type { ActorRunStatus } from "@/domain/sync/ports";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("webhook:apify");

/**
 * Two different kinds of Apify traffic land here, distinguished by
 * `eventData.actorRunId`:
 *
 * 1. Runs *this system triggered* (`application/collection/scrape-requests.actions.ts`'s
 *    `requestScrape`) — looked up by that run id against `scrape_requests` and
 *    completed via `completeScrapeRequest`, which wires the result into the normal
 *    sync pipeline.
 * 2. n8n pushing items into named Apify datasets via the Dataset API rather than by
 *    running an actor, so a "Run Succeeded" webhook never fires for that traffic —
 *    only an actor-run webhook (which carries `resource.defaultDatasetId`) reaches
 *    this handler at all. Falls back to the pre-existing dataset-externalId lookup.
 *
 * There is no cron poller anymore (removed in favor of external scheduling —
 * see docs/tech-debt.md). Until something external triggers sync directly,
 * this webhook and a manual "Sync" click in Admin → Datasets are the only ways
 * ingestion happens for case 2.
 */
export async function POST(request: Request) {
  const provided =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer /, "");

  if (!secretsMatch(provided, serverEnv().APIFY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    resource?: {
      defaultDatasetId?: string;
      status?: ActorRunStatus;
      usageTotalUsd?: number | null;
      finishedAt?: string | null;
    };
    eventData?: { actorRunId?: string };
  };
  const runId = body.eventData?.actorRunId ?? null;
  const externalId = body.resource?.defaultDatasetId ?? null;

  // Respond immediately; Apify retries on slow responses and the sync can take
  // considerably longer than a webhook timeout.
  after(async () => {
    try {
      if (runId) {
        const result = await completeScrapeRequest({
          apifyRunId: runId,
          status: body.resource?.status,
          defaultDatasetId: externalId,
          usageTotalUsd: body.resource?.usageTotalUsd ?? null,
          finishedAt: body.resource?.finishedAt ?? null,
        });
        revalidateTag(scrapeRequestsTag(), "max");
        if (result.handled) {
          if (result.datasetId) {
            revalidateTag(datasetTag(result.datasetId), "max");
            revalidateTag(leadsTag(), "max");
          }
          return;
        }
      }

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
      log.error("background work failed", { error, externalId, runId });
    }
  });

  return NextResponse.json({ ok: true, accepted: runId ?? externalId ?? "discovery" });
}
