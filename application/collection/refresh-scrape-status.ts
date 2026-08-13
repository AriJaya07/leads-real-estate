import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { ActionError } from "@/application/safe-action";
import { getActorRunner } from "@/infrastructure/connectors/registry";
import { toScrapeRequestStatus, type ScrapeRequestStatus } from "@/domain/collection/actor-request";
import { finalizeSucceededScrapeRequest } from "@/application/collection/complete-scrape-request";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("collection:refresh-scrape-status");

/**
 * Manual "check now" for a request stuck in `queued`/`running` — the same escape
 * hatch `runSync`'s manual button is for dataset ingestion, in case the completion
 * webhook was missed or never configured for this Apify account (e.g. `APP_URL`
 * pointing at a non-public host in local dev — see `start-scrape-request.ts`'s
 * `isPubliclyReachableUrl` guard). On a newly-observed success this wires the
 * result into the sync pipeline exactly like the webhook does
 * (`finalizeSucceededScrapeRequest`) — this used to only update the status
 * columns, silently leaving `sourceId`/`datasetId`/`itemCount` unset whenever a
 * request only ever completed via this poll instead of the webhook. Plain
 * orchestration module for the same reason `start-scrape-request.ts` is one —
 * see docs/coding-standards.md's repository/service split.
 */
export async function refreshScrapeStatus(companyId: string, id: string): Promise<{ status: ScrapeRequestStatus }> {
  const [request] = await db()
    .select()
    .from(schema.scrapeRequests)
    .where(and(eq(schema.scrapeRequests.id, id), eq(schema.scrapeRequests.companyId, companyId)))
    .limit(1);
  if (!request) throw new ActionError("Scrape request not found.");
  if (!request.apifyRunId) return { status: request.status };

  const run = await getActorRunner("apify").getRun(request.apifyRunId, { companyId });
  if (!run) return { status: request.status };

  const status = toScrapeRequestStatus(run.status);
  const apifyDatasetId = run.defaultDatasetId ?? request.apifyDatasetId;

  await db()
    .update(schema.scrapeRequests)
    .set({
      status,
      apifyDatasetId,
      usageUsd: run.usageUsd ?? request.usageUsd,
      finishedAt: run.finishedAt ?? request.finishedAt,
    })
    .where(eq(schema.scrapeRequests.id, request.id));

  if (status === "succeeded" && apifyDatasetId) {
    try {
      await finalizeSucceededScrapeRequest(request, apifyDatasetId);
    } catch (error) {
      log.error("failed to wire scrape result into sync pipeline", { error, requestId: request.id });
    }
  }

  return { status };
}
