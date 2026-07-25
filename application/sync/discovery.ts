import "server-only";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getConnector } from "@/infrastructure/connectors/registry";
import { DEFAULT_SYNC_INTERVAL_SECONDS } from "@/shared/constants";
import type { RemoteDataset } from "@/domain/sync/ports";

export interface DiscoveryResult {
  sourceId: string;
  seen: number;
  added: number;
  updated: number;
  missing: number;
  errors: string[];
}

interface SourceConfig {
  /** Only track datasets produced by these actors/workflows. Empty = all. */
  producerIds?: string[];
  /** Only track datasets whose name matches one of these substrings. Empty = all. */
  namePatterns?: string[];
  /** Skip per-run scratch datasets below this size. */
  minItemCount?: number;
}

function matchesFilters(dataset: RemoteDataset, config: SourceConfig): boolean {
  if (config.producerIds?.length && dataset.producerId) {
    if (!config.producerIds.includes(dataset.producerId)) return false;
  }
  if (config.namePatterns?.length) {
    const haystack = `${dataset.name ?? ""} ${dataset.title ?? ""}`.toLowerCase();
    if (!config.namePatterns.some((p) => haystack.includes(p.toLowerCase()))) return false;
  }
  if (config.minItemCount !== undefined && dataset.itemCount < config.minItemCount) return false;
  return true;
}

/**
 * Enumerates everything the source can see and reconciles it into the registry.
 *
 * This is what replaces the APIFY_DATASET_ID env var: a dataset that appears
 * upstream shows up here on the next discovery pass, with no human action and no
 * deploy.
 */
export async function discoverDatasets(sourceId: string): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { sourceId, seen: 0, added: 0, updated: 0, missing: 0, errors: [] };

  const [source] = await db()
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);

  if (!source) {
    result.errors.push("Source not found");
    return result;
  }
  if (!source.enabled) return result;

  const connector = getConnector(source.kind);
  const config = (source.config ?? {}) as SourceConfig;

  let remote: RemoteDataset[];
  try {
    remote = await connector.listDatasets();
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  const tracked = remote.filter((d) => matchesFilters(d, config));
  result.seen = tracked.length;

  const existing = await db()
    .select({
      id: schema.datasets.id,
      externalId: schema.datasets.externalId,
      itemCount: schema.datasets.itemCount,
      remoteModifiedAt: schema.datasets.remoteModifiedAt,
      status: schema.datasets.status,
    })
    .from(schema.datasets)
    .where(eq(schema.datasets.sourceId, sourceId));

  const byExternalId = new Map(existing.map((d) => [d.externalId, d]));
  const now = new Date();

  for (const dataset of tracked) {
    const current = byExternalId.get(dataset.externalId);

    if (!current) {
      await db()
        .insert(schema.datasets)
        .values({
          sourceId,
          externalId: dataset.externalId,
          name: dataset.name,
          title: dataset.title,
          producerId: dataset.producerId,
          producerRunId: dataset.producerRunId,
          itemCount: dataset.itemCount,
          remoteCreatedAt: dataset.createdAt,
          remoteModifiedAt: dataset.modifiedAt,
          syncIntervalSeconds: DEFAULT_SYNC_INTERVAL_SECONDS,
          // Due immediately so a newly discovered dataset is ingested on the
          // next sync tick rather than waiting out a full interval.
          nextSyncDueAt: now,
        })
        .onConflictDoNothing();
      result.added += 1;
      continue;
    }

    await db()
      .update(schema.datasets)
      .set({
        name: dataset.name,
        title: dataset.title,
        producerId: dataset.producerId,
        producerRunId: dataset.producerRunId,
        itemCount: dataset.itemCount,
        remoteModifiedAt: dataset.modifiedAt,
        // A dataset that reappears upstream comes back out of `missing`.
        status: current.status === "missing" ? "active" : current.status,
        updatedAt: now,
      })
      .where(eq(schema.datasets.id, current.id));
    result.updated += 1;
  }

  // Datasets that vanished upstream are flagged, never deleted — the history and
  // the leads derived from them stay valid.
  const trackedIds = tracked.map((d) => d.externalId);
  if (trackedIds.length > 0) {
    const missing = await db()
      .update(schema.datasets)
      .set({ status: "missing", updatedAt: now })
      .where(
        and(
          eq(schema.datasets.sourceId, sourceId),
          notInArray(schema.datasets.externalId, trackedIds),
          inArray(schema.datasets.status, ["active", "paused"]),
        ),
      )
      .returning({ id: schema.datasets.id });
    result.missing = missing.length;
  }

  await db()
    .update(schema.sources)
    .set({ lastDiscoveredAt: now, updatedAt: now })
    .where(eq(schema.sources.id, sourceId));

  return result;
}

export async function discoverAllSources(): Promise<DiscoveryResult[]> {
  const sources = await db()
    .select({ id: schema.sources.id })
    .from(schema.sources)
    .where(eq(schema.sources.enabled, true));

  const results: DiscoveryResult[] = [];
  for (const source of sources) {
    results.push(await discoverDatasets(source.id));
  }
  return results;
}
