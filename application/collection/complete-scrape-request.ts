import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getConnector } from "@/infrastructure/connectors/registry";
import { syncDataset } from "@/application/sync/sync-dataset";
import { toScrapeRequestStatus } from "@/domain/collection/actor-request";
import { tenantDatasetPrefix } from "@/domain/dataset/tenant-naming";
import type { ActorRunStatus } from "@/domain/sync/ports";
import type { ScrapeRequestRow } from "@/infrastructure/db/schema/collection";
import { DEFAULT_SYNC_INTERVAL_SECONDS } from "@/shared/constants";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("collection:complete-scrape-request");

export interface ScrapeRunWebhookPayload {
  apifyRunId: string;
  status?: ActorRunStatus;
  defaultDatasetId?: string | null;
  usageTotalUsd?: number | null;
  finishedAt?: string | null;
}

export interface CompleteScrapeRequestResult {
  /** False when `apifyRunId` doesn't match a request we started — caller falls back to the legacy path. */
  handled: boolean;
  datasetId?: string;
}

/**
 * One company's `sources`/`datasets` row for everything a given actor template
 * produces for them — created on first success, reused after. Same "Source =
 * connector instance, Dataset = one upstream collection" model discovery.ts
 * already uses, just populated by a triggered run instead of a discovery sweep.
 */
async function ensureDatasetForScrapeRequest(
  request: ScrapeRequestRow,
  apifyDatasetId: string,
): Promise<{ sourceId: string; datasetId: string }> {
  const sourceName = `Apify — ${request.templateName}`;

  let [source] = await db()
    .select()
    .from(schema.sources)
    .where(
      and(
        eq(schema.sources.companyId, request.companyId),
        eq(schema.sources.kind, "apify"),
        eq(schema.sources.name, sourceName),
      ),
    )
    .limit(1);

  if (!source) {
    // Empty `namePatterns` would match every dataset visible under the one
    // Apify account this whole platform shares across companies — see
    // docs/multi-tenant-apify-isolation-plan.md §1. Auto-derived from the
    // company's own slug so this can never be left blank by a human.
    const [company] = await db()
      .select({ slug: schema.companies.slug })
      .from(schema.companies)
      .where(eq(schema.companies.id, request.companyId))
      .limit(1);
    const config = company ? { namePatterns: [tenantDatasetPrefix(company.slug)], producerIds: [], minItemCount: 1 } : {};

    await db()
      .insert(schema.sources)
      .values({ companyId: request.companyId, kind: "apify", name: sourceName, config })
      .onConflictDoNothing();
    [source] = await db()
      .select()
      .from(schema.sources)
      .where(
        and(
          eq(schema.sources.companyId, request.companyId),
          eq(schema.sources.kind, "apify"),
          eq(schema.sources.name, sourceName),
        ),
      )
      .limit(1);
  }
  if (!source) throw new Error(`Failed to resolve source for scrape request ${request.id}`);

  let [dataset] = await db()
    .select()
    .from(schema.datasets)
    .where(and(eq(schema.datasets.sourceId, source.id), eq(schema.datasets.externalId, apifyDatasetId)))
    .limit(1);

  if (!dataset) {
    const remote = await getConnector("apify").getDataset(apifyDatasetId, { companyId: request.companyId });
    await db()
      .insert(schema.datasets)
      .values({
        companyId: request.companyId,
        sourceId: source.id,
        externalId: apifyDatasetId,
        name: remote?.name ?? null,
        title: remote?.title ?? request.templateName,
        producerId: remote?.producerId ?? request.actorId,
        producerRunId: request.apifyRunId,
        itemCount: remote?.itemCount ?? 0,
        remoteCreatedAt: remote?.createdAt ?? null,
        remoteModifiedAt: remote?.modifiedAt ?? null,
        syncIntervalSeconds: DEFAULT_SYNC_INTERVAL_SECONDS,
        // A triggered run's dataset is a one-off snapshot, not a recurring feed —
        // nothing new lands in it without another explicit scrape request. An
        // admin can still flip this on from /admin/datasets if the underlying
        // actor run itself turns out to be recurring.
        autoSyncEnabled: false,
        nextSyncDueAt: new Date(),
      })
      .onConflictDoNothing();
    [dataset] = await db()
      .select()
      .from(schema.datasets)
      .where(and(eq(schema.datasets.sourceId, source.id), eq(schema.datasets.externalId, apifyDatasetId)))
      .limit(1);
  }
  if (!dataset) throw new Error(`Failed to resolve dataset for scrape request ${request.id}`);

  return { sourceId: source.id, datasetId: dataset.id };
}

/**
 * Wires a succeeded run's output dataset into the ordinary sync pipeline
 * (discover → ingest → normalize → classify → score → store) and updates the
 * request row's `sourceId`/`datasetId`/`itemCount` accordingly. Shared by both
 * ways a request can be observed to have succeeded — the Apify completion
 * webhook (`completeScrapeRequest`) and the manual "check now" poll
 * (`refreshScrapeStatus`, for when the webhook never fires — e.g. `APP_URL`
 * pointing at a non-public host, where `startScrapeRequest` skips webhook
 * registration entirely). Idempotent: safe to call again for a request that's
 * already wired, same posture `ensureDatasetForScrapeRequest`'s
 * `onConflictDoNothing` already relies on.
 */
export async function finalizeSucceededScrapeRequest(
  request: ScrapeRequestRow,
  apifyDatasetId: string,
): Promise<{ sourceId: string; datasetId: string; itemCount: number }> {
  const linked = await ensureDatasetForScrapeRequest(request, apifyDatasetId);
  const outcome = await syncDataset(linked.datasetId, "webhook", { force: true });
  await db()
    .update(schema.scrapeRequests)
    .set({ sourceId: linked.sourceId, datasetId: linked.datasetId, itemCount: outcome.itemsSeen })
    .where(eq(schema.scrapeRequests.id, request.id));
  return { ...linked, itemCount: outcome.itemsSeen };
}

/**
 * Called from the Apify webhook route for every run-status event. Looks up the
 * `scrape_requests` row by `apifyRunId` — a run this system triggered, as opposed
 * to the legacy n8n-pushed-dataset traffic the webhook also still handles.
 */
export async function completeScrapeRequest(payload: ScrapeRunWebhookPayload): Promise<CompleteScrapeRequestResult> {
  const [request] = await db()
    .select()
    .from(schema.scrapeRequests)
    .where(eq(schema.scrapeRequests.apifyRunId, payload.apifyRunId))
    .limit(1);
  if (!request) return { handled: false };

  const status = payload.status ? toScrapeRequestStatus(payload.status) : request.status;
  const apifyDatasetId = payload.defaultDatasetId ?? request.apifyDatasetId;

  await db()
    .update(schema.scrapeRequests)
    .set({
      status,
      apifyDatasetId,
      usageUsd: payload.usageTotalUsd ?? request.usageUsd,
      finishedAt: payload.finishedAt ? new Date(payload.finishedAt) : request.finishedAt,
    })
    .where(eq(schema.scrapeRequests.id, request.id));

  if (status === "succeeded" && apifyDatasetId) {
    try {
      const linked = await finalizeSucceededScrapeRequest(request, apifyDatasetId);
      return { handled: true, datasetId: linked.datasetId };
    } catch (error) {
      log.error("failed to wire scrape result into sync pipeline", { error, requestId: request.id });
    }
  }

  return { handled: true, datasetId: request.datasetId ?? undefined };
}
