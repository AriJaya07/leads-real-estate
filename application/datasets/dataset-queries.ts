import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { datasetsRegistryTag, leadsTag } from "@/application/cache-tags";

export interface DatasetSummary {
  id: string;
  externalId: string;
  label: string;
  status: string;
  health: string;
  healthDetail: string | null;
  itemCount: number;
  leadCount: number;
  buyerCount: number;
  lastSyncedAt: Date | null;
  nextSyncDueAt: Date | null;
  autoSyncEnabled: boolean;
  syncIntervalSeconds: number;
  mappingProfileName: string | null;
  mappingApproved: boolean;
  schemaFingerprint: string | null;
}

function label(name: string | null, title: string | null, externalId: string): string {
  return title ?? name ?? `Unnamed (${externalId.slice(0, 8)})`;
}

/**
 * Cached: this backs the topbar switcher and `/admin/datasets`, both read far
 * more often than a dataset actually changes. `updateTag(datasetsRegistryTag())`
 * (dataset.actions.ts) gives an admin's own change read-your-own-writes
 * immediacy regardless of this cache; `leadsTag()` is the backstop for
 * `leadCount`/`buyerCount` drifting from webhook-triggered syncs, which only
 * revalidate `leadsTag()` in the background — see api-patterns.md.
 */
export async function listDatasets(): Promise<DatasetSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(datasetsRegistryTag(), leadsTag());

  const rows = await db()
    .select({
      id: schema.datasets.id,
      externalId: schema.datasets.externalId,
      name: schema.datasets.name,
      title: schema.datasets.title,
      status: schema.datasets.status,
      health: schema.datasets.health,
      healthDetail: schema.datasets.healthDetail,
      itemCount: schema.datasets.itemCount,
      lastSyncedAt: schema.datasets.lastSyncedAt,
      nextSyncDueAt: schema.datasets.nextSyncDueAt,
      autoSyncEnabled: schema.datasets.autoSyncEnabled,
      syncIntervalSeconds: schema.datasets.syncIntervalSeconds,
      schemaFingerprint: schema.datasets.schemaFingerprint,
      mappingProfileName: schema.mappingProfiles.name,
      mappingApproved: sql<boolean>`${schema.mappingProfiles.approvedAt} IS NOT NULL`,
      leadCount: sql<number>`(
        SELECT count(*)::int FROM ${schema.leads}
        WHERE ${schema.leads.datasetId} = ${schema.datasets.id}
          AND ${schema.leads.canonicalLeadId} IS NULL AND ${schema.leads.isSpam} = false
      )`,
      buyerCount: sql<number>`(
        SELECT count(*)::int FROM ${schema.leads}
        WHERE ${schema.leads.datasetId} = ${schema.datasets.id}
          AND ${schema.leads.canonicalLeadId} IS NULL AND ${schema.leads.isSpam} = false
          AND ${schema.leads.intent} = 'buyer'
      )`,
    })
    .from(schema.datasets)
    .leftJoin(schema.mappingProfiles, eq(schema.mappingProfiles.id, schema.datasets.mappingProfileId))
    .orderBy(desc(sql`(SELECT count(*) FROM ${schema.leads} WHERE ${schema.leads.datasetId} = ${schema.datasets.id})`));

  return rows.map((row) => ({
    ...row,
    label: label(row.name, row.title, row.externalId),
  }));
}

export async function getDatasetDetail(datasetId: string) {
  const [dataset] = await db()
    .select()
    .from(schema.datasets)
    .where(eq(schema.datasets.id, datasetId))
    .limit(1);
  if (!dataset) return null;

  const [runs, versions, fields, profile] = await Promise.all([
    db()
      .select()
      .from(schema.syncRuns)
      .where(eq(schema.syncRuns.datasetId, datasetId))
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(25),
    db()
      .select()
      .from(schema.datasetVersions)
      .where(eq(schema.datasetVersions.datasetId, datasetId))
      .orderBy(desc(schema.datasetVersions.versionNo))
      .limit(10),
    db()
      .select()
      .from(schema.fieldCatalog)
      .where(eq(schema.fieldCatalog.datasetId, datasetId))
      .orderBy(desc(schema.fieldCatalog.fillRate)),
    dataset.mappingProfileId
      ? db()
          .select()
          .from(schema.mappingProfiles)
          .where(eq(schema.mappingProfiles.id, dataset.mappingProfileId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    dataset: { ...dataset, label: label(dataset.name, dataset.title, dataset.externalId) },
    runs,
    versions,
    fields,
    profile: profile[0] ?? null,
  };
}

export interface RecentSyncRun {
  id: string;
  datasetId: string;
  datasetLabel: string;
  trigger: string;
  status: string;
  itemsSeen: number;
  itemsNew: number;
  leadsCreated: number;
  errorSummary: string | null;
  durationMs: number | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/**
 * The "recent runs across all datasets" query `docs/tech-debt.md` flagged as
 * the missing piece for a cross-dataset activity feed — everything else
 * (`getDatasetDetail`, `getSyncEvents`) already existed unused.
 *
 * Cached like `listDatasets`, and for the same reason that matters more here
 * than it looks: `/admin/sync`'s `RecentActivity` component takes no props
 * and calls no dynamic API (no `searchParams`/`cookies`), so under Cache
 * Components it's eligible to be baked into the static build shell and never
 * re-run — `"use cache"` plus a tag `runSync`/`setDatasetStatus` already
 * invalidate is what keeps it live instead of frozen at build time.
 */
export async function getRecentSyncRuns(limit = 50): Promise<RecentSyncRun[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(datasetsRegistryTag(), leadsTag());

  const rows = await db()
    .select({
      id: schema.syncRuns.id,
      datasetId: schema.syncRuns.datasetId,
      name: schema.datasets.name,
      title: schema.datasets.title,
      externalId: schema.datasets.externalId,
      trigger: schema.syncRuns.trigger,
      status: schema.syncRuns.status,
      itemsSeen: schema.syncRuns.itemsSeen,
      itemsNew: schema.syncRuns.itemsNew,
      leadsCreated: schema.syncRuns.leadsCreated,
      errorSummary: schema.syncRuns.errorSummary,
      durationMs: schema.syncRuns.durationMs,
      startedAt: schema.syncRuns.startedAt,
      finishedAt: schema.syncRuns.finishedAt,
    })
    .from(schema.syncRuns)
    .innerJoin(schema.datasets, eq(schema.datasets.id, schema.syncRuns.datasetId))
    .orderBy(desc(schema.syncRuns.startedAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    datasetLabel: label(row.name, row.title, row.externalId),
  }));
}

export async function getSyncEvents(syncRunId: string) {
  return db()
    .select()
    .from(schema.syncEvents)
    .where(eq(schema.syncEvents.syncRunId, syncRunId))
    .orderBy(schema.syncEvents.at);
}

/**
 * Global sync posture for the admin monitor. Cached for the same reason as
 * `getRecentSyncRuns` — this backs a prop-less, dynamic-API-free Suspense
 * child on both `/admin/datasets` and `/admin/sync`, which needs `"use cache"`
 * to avoid being frozen into the static build shell.
 */
export async function getSyncOverview() {
  "use cache";
  cacheLife("minutes");
  cacheTag(datasetsRegistryTag(), leadsTag());

  const [row] = await db()
    .select({
      datasets: sql<number>`count(*)::int`,
      active: sql<number>`count(*) FILTER (WHERE ${schema.datasets.status} = 'active')::int`,
      healthy: sql<number>`count(*) FILTER (WHERE ${schema.datasets.health} = 'healthy')::int`,
      needsAttention: sql<number>`count(*) FILTER (WHERE ${schema.datasets.health} IN ('error','degraded','schema_drift'))::int`,
      stale: sql<number>`count(*) FILTER (WHERE ${schema.datasets.health} = 'stale')::int`,
      due: sql<number>`count(*) FILTER (WHERE ${schema.datasets.nextSyncDueAt} <= now())::int`,
    })
    .from(schema.datasets);

  const [recent] = await db()
    .select({
      lastRunAt: sql<Date | null>`max(${schema.syncRuns.startedAt})`,
      failures24h: sql<number>`count(*) FILTER (WHERE ${schema.syncRuns.status} = 'failed' AND ${schema.syncRuns.startedAt} > now() - interval '24 hours')::int`,
      runs24h: sql<number>`count(*) FILTER (WHERE ${schema.syncRuns.startedAt} > now() - interval '24 hours')::int`,
      leads24h: sql<number>`coalesce(sum(${schema.syncRuns.leadsCreated}) FILTER (WHERE ${schema.syncRuns.startedAt} > now() - interval '24 hours'), 0)::int`,
    })
    .from(schema.syncRuns);

  return { ...row, ...recent };
}
