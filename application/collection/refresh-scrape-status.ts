import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { ActionError } from "@/application/safe-action";
import { getActorRunner } from "@/infrastructure/connectors/registry";
import { toScrapeRequestStatus, type ScrapeRequestStatus } from "@/domain/collection/actor-request";

/**
 * Manual "check now" for a request stuck in `queued`/`running` — the same escape
 * hatch `runSync`'s manual button is for dataset ingestion, in case the completion
 * webhook was missed or never configured for this Apify account. Plain
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
  await db()
    .update(schema.scrapeRequests)
    .set({
      status,
      apifyDatasetId: run.defaultDatasetId ?? request.apifyDatasetId,
      usageUsd: run.usageUsd ?? request.usageUsd,
      finishedAt: run.finishedAt ?? request.finishedAt,
    })
    .where(eq(schema.scrapeRequests.id, request.id));

  return { status };
}
