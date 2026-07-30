import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { getConnector } from "@/infrastructure/connectors/registry";
import {
  diffSchema,
  fingerprintSchema,
  inferSchema,
  isSchemaDrift,
} from "@/domain/dataset/schema-inference";
import { proposeMapping } from "@/domain/dataset/mapping-proposal";
import { assessMappingQuality } from "@/domain/dataset/mapping-quality";
import { computeHealth, nextIntervalSeconds } from "@/domain/sync/scheduling";
import type { FieldProfile, MappingRules } from "@/domain/dataset/types";
import {
  FACETABLE_MAX_CARDINALITY,
  FACETABLE_MIN_FILL_RATE,
  MAPPING_AUTO_APPROVE_CONFIDENCE,
  SCHEMA_SAMPLE_SIZE,
  SYNC_MAX_PAGES_PER_RUN,
  SYNC_PAGE_SIZE,
} from "@/shared/constants";
import { processRawRecords } from "@/application/leads/process-records";
import { SyncLogger } from "./sync-logger";
import { dispatchAlertsForLeads } from "@/application/alerting/dispatch";
import { incrementRawRecordUsage, incrementStorageUsage, isWithinMonthlyBudget } from "@/application/billing/usage";

interface SyncCursor {
  lastOffset?: number;
  lastItemCount?: number;
  lastSyncedAt?: string;
}

export interface SyncOutcome {
  datasetId: string;
  status: "succeeded" | "partial" | "failed" | "skipped";
  reason?: string;
  itemsSeen: number;
  itemsNew: number;
  leadsCreated: number;
  syncRunId?: string;
}

function normalizeForHash(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Best-effort text extraction for the content hash before a mapping exists. */
function guessBody(payload: Record<string, unknown>): string {
  for (const key of ["text", "message", "content", "caption", "description", "body"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return JSON.stringify(payload);
}

function guessItemId(payload: Record<string, unknown>, offset: number): string {
  for (const key of ["id", "postId", "legacyId", "itemId", "uuid"]) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return `offset:${offset}:${sha256(JSON.stringify(payload)).slice(0, 16)}`;
}

/**
 * Syncs one dataset incrementally.
 *
 * Work is committed page by page so a timeout, deploy or crash resumes from the
 * last committed offset instead of restarting. That is what keeps a large
 * backfill inside a serverless invocation without a job queue.
 */
export async function syncDataset(
  datasetId: string,
  trigger: "cron" | "webhook" | "manual" | "discovery",
  options: { force?: boolean } = {},
): Promise<SyncOutcome> {
  const [dataset] = await db()
    .select()
    .from(schema.datasets)
    .where(eq(schema.datasets.id, datasetId))
    .limit(1);

  if (!dataset) {
    return { datasetId, status: "failed", reason: "Dataset not found", itemsSeen: 0, itemsNew: 0, leadsCreated: 0 };
  }
  if (dataset.status === "archived" || dataset.status === "missing") {
    return { datasetId, status: "skipped", reason: `Dataset is ${dataset.status}`, itemsSeen: 0, itemsNew: 0, leadsCreated: 0 };
  }
  // Read off the dataset row already loaded above, not threaded in as a
  // separate parameter — every write below (sync_runs, raw_records,
  // dataset_versions, field_catalog, leads/lead_appearances via
  // processRawRecords) tags itself with this.
  const companyId = dataset.companyId;

  // Checked before any Apify call this run makes (including the probe just
  // below) — a company already over its monthly request budget shouldn't
  // spend even one more call finding that out. Non-throwing: a background
  // cron context degrades to "skip and log," never an uncaught failure.
  if (!(await isWithinMonthlyBudget(companyId, "apifyRequests"))) {
    return {
      datasetId,
      status: "skipped",
      reason: "Monthly Apify request budget reached for this plan",
      itemsSeen: 0,
      itemsNew: 0,
      leadsCreated: 0,
    };
  }

  const [source] = await db()
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, dataset.sourceId))
    .limit(1);
  if (!source) {
    return { datasetId, status: "failed", reason: "Source not found", itemsSeen: 0, itemsNew: 0, leadsCreated: 0 };
  }

  const connector = getConnector(source.kind);
  const cursor = (dataset.syncCursor ?? {}) as SyncCursor;

  // --- Probe: cheap change check before any expensive pull ------------------
  let remoteItemCount = dataset.itemCount;
  let remoteModifiedAt = dataset.remoteModifiedAt;
  try {
    const remote = await connector.getDataset(dataset.externalId, { companyId });
    if (remote) {
      remoteItemCount = remote.itemCount;
      remoteModifiedAt = remote.modifiedAt;
    }
  } catch {
    // Probe failure is not fatal; fall through and let the item fetch decide.
  }

  const modifiedMoved =
    remoteModifiedAt && dataset.remoteModifiedAt
      ? remoteModifiedAt.getTime() > dataset.remoteModifiedAt.getTime()
      : Boolean(remoteModifiedAt);
  const countMoved = remoteItemCount !== (cursor.lastItemCount ?? -1);
  const hasNewItems = remoteItemCount > (cursor.lastOffset ?? 0);

  if (!options.force && !modifiedMoved && !countMoved && !hasNewItems) {
    await db()
      .update(schema.datasets)
      .set({
        nextSyncDueAt: new Date(
          Date.now() +
            nextIntervalSeconds({
              baseIntervalSeconds: dataset.syncIntervalSeconds,
              producedNewItems: false,
              consecutiveFailures: 0,
            }) * 1000,
        ),
        healthCheckedAt: new Date(),
      })
      .where(eq(schema.datasets.id, datasetId));

    return { datasetId, status: "skipped", reason: "No upstream change", itemsSeen: 0, itemsNew: 0, leadsCreated: 0 };
  }

  // --- Start the run -------------------------------------------------------
  const startedAt = Date.now();
  const [run] = await db()
    .insert(schema.syncRuns)
    .values({ companyId, datasetId, trigger, status: "running", startCursor: { ...cursor } })
    .returning({ id: schema.syncRuns.id });

  const log = new SyncLogger(companyId, run.id);
  log.info("start", `Sync started (${trigger})`, {
    externalId: dataset.externalId,
    fromOffset: cursor.lastOffset ?? 0,
  });

  let offset = cursor.lastOffset ?? 0;
  // A shrinking upstream means the dataset was rebuilt; the offset watermark is
  // meaningless against different data, so re-read from the top.
  if (remoteItemCount < (cursor.lastItemCount ?? 0)) {
    log.warn("cursor", "Upstream item count shrank — resetting cursor for a full resync", {
      was: cursor.lastItemCount,
      now: remoteItemCount,
    });
    offset = 0;
  }

  let itemsSeen = 0;
  let itemsNew = 0;
  let itemsUpdated = 0;
  let leadsCreated = 0;
  let duplicates = 0;
  let failed = 0;
  let truncated = false;
  const sampleForSchema: Record<string, unknown>[] = [];
  const newRawRecordIds: string[] = [];
  let errorSummary: string | null = null;

  try {
    for (let page = 0; page < SYNC_MAX_PAGES_PER_RUN; page++) {
      const result = await connector.fetchItems(dataset.externalId, offset, SYNC_PAGE_SIZE, { companyId });
      if (result.items.length === 0) break;

      itemsSeen += result.items.length;

      const rows = result.items.map((payload, index) => ({
        companyId,
        datasetId,
        sourceItemId: guessItemId(payload, offset + index),
        payload,
        contentHash: sha256(normalizeForHash(guessBody(payload))),
        payloadHash: sha256(JSON.stringify(payload)),
        ingestOffset: offset + index,
        syncRunId: run.id,
        lastSeenAt: new Date(),
      }));

      for (const row of rows) {
        if (sampleForSchema.length < SCHEMA_SAMPLE_SIZE) sampleForSchema.push(row.payload);
      }

      const inserted = await db()
        .insert(schema.rawRecords)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.rawRecords.datasetId, schema.rawRecords.sourceItemId],
          set: {
            payload: sql`excluded.payload`,
            payloadHash: sql`excluded.payload_hash`,
            contentHash: sql`excluded.content_hash`,
            lastSeenAt: sql`excluded.last_seen_at`,
            syncRunId: sql`excluded.sync_run_id`,
          },
        })
        .returning({ id: schema.rawRecords.id, firstSeenAt: schema.rawRecords.firstSeenAt });

      let newRecordBytes = 0;
      inserted.forEach((row, index) => {
        if (Date.now() - row.firstSeenAt.getTime() < 5_000) {
          itemsNew += 1;
          newRawRecordIds.push(row.id);
          // Only newly-inserted rows count toward storage — an
          // `onConflictDoUpdate` overwrite doesn't meaningfully grow it the
          // way a fresh row does.
          newRecordBytes += Buffer.byteLength(JSON.stringify(rows[index].payload));
        } else {
          itemsUpdated += 1;
        }
      });

      // "Data fetch" counts everything pulled this page, new or updated —
      // Apify/the upstream source was queried for all of it regardless of
      // dedup outcome. Storage counts new rows only. Neither throws or
      // blocks the run; a billing-metric failure must never break ingestion.
      await incrementRawRecordUsage(companyId, result.items.length);
      if (newRecordBytes > 0) await incrementStorageUsage(companyId, newRecordBytes);

      offset += result.items.length;

      // Commit the watermark per page so an interrupted run resumes here.
      await db()
        .update(schema.datasets)
        .set({
          syncCursor: {
            lastOffset: offset,
            lastItemCount: remoteItemCount,
            lastSyncedAt: new Date().toISOString(),
          },
        })
        .where(eq(schema.datasets.id, datasetId));

      log.debug("ingest", `Ingested page at offset ${offset}`, { count: result.items.length });

      if (result.items.length < SYNC_PAGE_SIZE) break;
      if (page === SYNC_MAX_PAGES_PER_RUN - 1) truncated = true;
    }

    // --- Schema inference + drift detection --------------------------------
    let fieldProfiles: FieldProfile[] = [];
    let drifted = false;

    if (sampleForSchema.length > 0) {
      fieldProfiles = inferSchema(sampleForSchema);
      const fingerprint = fingerprintSchema(fieldProfiles);

      if (fingerprint !== dataset.schemaFingerprint) {
        const [previousVersion] = await db()
          .select()
          .from(schema.datasetVersions)
          .where(eq(schema.datasetVersions.datasetId, datasetId))
          .orderBy(sql`${schema.datasetVersions.versionNo} DESC`)
          .limit(1);

        const diff = diffSchema(previousVersion?.fieldProfile ?? [], fieldProfiles);
        drifted = Boolean(previousVersion) && isSchemaDrift(diff);

        await db()
          .insert(schema.datasetVersions)
          .values({
            companyId,
            datasetId,
            versionNo: (previousVersion?.versionNo ?? 0) + 1,
            itemCount: remoteItemCount,
            schemaFingerprint: fingerprint,
            fieldProfile: fieldProfiles,
            schemaDiff: diff as unknown as Record<string, unknown>,
            // A first version is accepted implicitly; a later change is not.
            acceptedAt: previousVersion ? null : new Date(),
          });

        log.warn("schema", drifted ? "Schema drift detected" : "New schema version captured", {
          added: diff.added.length,
          removed: diff.removed.length,
          typeChanged: diff.typeChanged.length,
        });
      }

      await upsertFieldCatalog(companyId, datasetId, fieldProfiles);
      await db()
        .update(schema.datasets)
        .set({ schemaFingerprint: fingerprint })
        .where(eq(schema.datasets.id, datasetId));
    }

    // --- Mapping profile ----------------------------------------------------
    const { rules, profileId, passthrough, recordKind, platform, isFreshlyAutoApproved } =
      await resolveMappingProfile(datasetId, dataset.mappingProfileId, source.kind, fieldProfiles, log);

    // --- Normalize + classify ----------------------------------------------
    if (rules && newRawRecordIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < newRawRecordIds.length; i += batchSize) {
        const ids = newRawRecordIds.slice(i, i + batchSize);
        const records = await db()
          .select()
          .from(schema.rawRecords)
          .where(inArray(schema.rawRecords.id, ids));

        const processed = await processRawRecords(records, rules, {
          companyId,
          passthrough,
          datasetId,
          recordKind,
          platform,
        });
        leadsCreated += processed.created;
        duplicates += processed.duplicates;
        failed += processed.failed;

        if (processed.leadIds.length > 0) {
          const alerted = await dispatchAlertsForLeads(companyId, processed.leadIds);
          if (alerted.sent > 0) {
            log.info("alert", `Dispatched ${alerted.sent} alert(s)`, { rules: alerted.ruleNames });
          }
        }
      }

      // A wrong-but-plausible auto-approved mapping looks like it worked — it
      // just quietly produces spam-flagged or empty-body leads. Checking only the
      // profile's first batch, and only revoking (not blocking) it, is what keeps
      // this from also punishing a genuinely spam-heavy source on every run.
      if (isFreshlyAutoApproved && profileId) {
        const [sample] = await db()
          .select({
            total: sql<number>`count(*)::int`,
            spam: sql<number>`count(*) FILTER (WHERE ${schema.leadAppearances.isSpam})::int`,
            emptyBody: sql<number>`count(*) FILTER (WHERE ${schema.leadAppearances.body} = '')::int`,
          })
          .from(schema.leadAppearances)
          .where(inArray(schema.leadAppearances.rawRecordId, newRawRecordIds));

        const assessment = assessMappingQuality({
          total: sample?.total ?? 0,
          spam: sample?.spam ?? 0,
          emptyBody: sample?.emptyBody ?? 0,
          recordKind,
        });

        if (assessment.suspect) {
          await db()
            .update(schema.mappingProfiles)
            .set({ approvedAt: null })
            .where(eq(schema.mappingProfiles.id, profileId));
          log.warn("mapping-quality", `Auto-approved mapping profile revoked: ${assessment.reason}`, {
            sample,
          });
        }
      }
    } else if (!rules) {
      log.warn("mapping", "No approved mapping profile — records stored but not normalized");
    }

    if (profileId && profileId !== dataset.mappingProfileId) {
      await db()
        .update(schema.datasets)
        .set({ mappingProfileId: profileId })
        .where(eq(schema.datasets.id, datasetId));
    }

    // --- Health + schedule --------------------------------------------------
    const normalizationFailureRate = itemsSeen > 0 ? failed / itemsSeen : 0;
    const health = computeHealth({
      consecutiveFailures: 0,
      lastSyncedAt: new Date(),
      remoteModifiedAt,
      syncIntervalSeconds: dataset.syncIntervalSeconds,
      hasSchemaDrift: drifted,
      normalizationFailureRate,
    });

    const interval = nextIntervalSeconds({
      baseIntervalSeconds: dataset.syncIntervalSeconds,
      producedNewItems: itemsNew > 0,
      consecutiveFailures: 0,
    });

    await db()
      .update(schema.datasets)
      .set({
        itemCount: remoteItemCount,
        remoteModifiedAt,
        lastSyncedAt: new Date(),
        consecutiveFailures: 0,
        health: health.health,
        healthDetail: health.detail,
        healthCheckedAt: new Date(),
        // A truncated run is due again immediately so the backfill continues.
        nextSyncDueAt: new Date(Date.now() + (truncated ? 0 : interval * 1000)),
        updatedAt: new Date(),
      })
      .where(eq(schema.datasets.id, datasetId));
  } catch (error) {
    errorSummary = error instanceof Error ? error.message : String(error);
    log.error("failed", errorSummary);

    const failures = dataset.consecutiveFailures + 1;
    const health = computeHealth({
      consecutiveFailures: failures,
      lastSyncedAt: dataset.lastSyncedAt,
      remoteModifiedAt,
      syncIntervalSeconds: dataset.syncIntervalSeconds,
      hasSchemaDrift: false,
      normalizationFailureRate: 0,
    });

    await db()
      .update(schema.datasets)
      .set({
        consecutiveFailures: failures,
        health: health.health,
        healthDetail: health.detail,
        healthCheckedAt: new Date(),
        nextSyncDueAt: new Date(
          Date.now() +
            nextIntervalSeconds({
              baseIntervalSeconds: dataset.syncIntervalSeconds,
              producedNewItems: false,
              consecutiveFailures: failures,
            }) * 1000,
        ),
      })
      .where(eq(schema.datasets.id, datasetId));
  }

  const status = errorSummary ? "failed" : truncated ? "partial" : "succeeded";

  await db()
    .update(schema.syncRuns)
    .set({
      status,
      itemsSeen,
      itemsNew,
      itemsUpdated,
      itemsDuplicate: duplicates,
      itemsFailed: failed,
      leadsCreated,
      endCursor: { lastOffset: offset, lastItemCount: remoteItemCount },
      errorSummary,
      durationMs: Date.now() - startedAt,
      finishedAt: new Date(),
    })
    .where(eq(schema.syncRuns.id, run.id));

  log.info("done", `Sync ${status}`, { itemsSeen, itemsNew, leadsCreated });
  await log.flush();

  return { datasetId, status, reason: errorSummary ?? undefined, itemsSeen, itemsNew, leadsCreated, syncRunId: run.id };
}

async function upsertFieldCatalog(
  companyId: string,
  datasetId: string,
  profiles: FieldProfile[],
): Promise<void> {
  if (profiles.length === 0) return;

  const rows = profiles.map((profile) => ({
    companyId,
    datasetId,
    path: profile.path,
    inferredType: profile.type,
    nullable: profile.nullable,
    fillRate: profile.fillRate,
    cardinality: profile.cardinality,
    sampleValues: profile.sampleValues,
    // Low-cardinality, well-populated fields make good filters. Admins can override.
    facetable:
      profile.cardinality > 1 &&
      profile.cardinality <= FACETABLE_MAX_CARDINALITY &&
      profile.fillRate >= FACETABLE_MIN_FILL_RATE &&
      (profile.type === "string" || profile.type === "boolean" || profile.type === "number"),
    lastSeenAt: new Date(),
  }));

  await db()
    .insert(schema.fieldCatalog)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.fieldCatalog.datasetId, schema.fieldCatalog.path],
      set: {
        inferredType: sql`excluded.inferred_type`,
        nullable: sql`excluded.nullable`,
        fillRate: sql`excluded.fill_rate`,
        cardinality: sql`excluded.cardinality`,
        sampleValues: sql`excluded.sample_values`,
        facetable: sql`excluded.facetable`,
        lastSeenAt: sql`excluded.last_seen_at`,
      },
    });
}

/**
 * Resolves the mapping profile for a dataset, proposing one on first sight.
 *
 * A low-confidence proposal is stored but left unapproved: a wrong auto-map is
 * worse than no map, because it looks like it worked.
 */
async function resolveMappingProfile(
  datasetId: string,
  currentProfileId: string | null,
  sourceKind: "apify" | "n8n" | "webform" | "manual",
  fieldProfiles: FieldProfile[],
  log: SyncLogger,
): Promise<{
  rules: MappingRules | null;
  profileId: string | null;
  passthrough: boolean;
  recordKind: "content_post" | "engagement_like" | "engagement_comment";
  platform: "facebook" | "instagram" | "other";
  /** True only for a profile both auto-generated *and* newly attached in this call — see mapping-quality.ts. */
  isFreshlyAutoApproved: boolean;
}> {
  if (currentProfileId) {
    const [profile] = await db()
      .select()
      .from(schema.mappingProfiles)
      .where(eq(schema.mappingProfiles.id, currentProfileId))
      .limit(1);
    if (profile && profile.approvedAt) {
      return {
        rules: profile.rules,
        profileId: profile.id,
        passthrough: profile.passthrough,
        recordKind: profile.recordKind,
        platform: profile.platform,
        isFreshlyAutoApproved: false,
      };
    }
    if (profile) {
      log.warn("mapping", `Mapping profile "${profile.name}" is awaiting admin approval`);
      return {
        rules: null,
        profileId: profile.id,
        passthrough: profile.passthrough,
        recordKind: profile.recordKind,
        platform: profile.platform,
        isFreshlyAutoApproved: false,
      };
    }
  }

  if (fieldProfiles.length === 0) {
    return {
      rules: null,
      profileId: null,
      passthrough: true,
      recordKind: "content_post",
      platform: "facebook",
      isFreshlyAutoApproved: false,
    };
  }

  // A curated, hand-verified profile always wins over an auto-proposal. Claim is
  // by required-path match, so the same profile picks up every dataset produced
  // by the same actor without anyone wiring them together.
  const paths = new Set(fieldProfiles.map((p) => p.path));
  const curated = await db()
    .select()
    .from(schema.mappingProfiles)
    .where(
      and(
        eq(schema.mappingProfiles.sourceKind, sourceKind),
        eq(schema.mappingProfiles.autoGenerated, false),
      ),
    );

  const claimed = curated
    .filter((p) => p.matchPaths.length > 0 && p.matchPaths.every((path) => paths.has(path)))
    .sort((a, b) => b.matchPaths.length - a.matchPaths.length)[0];

  if (claimed) {
    log.info("mapping", `Matched curated mapping profile "${claimed.name}"`, {
      matchedOn: claimed.matchPaths.length,
    });
    return {
      rules: claimed.rules,
      profileId: claimed.id,
      passthrough: claimed.passthrough,
      recordKind: claimed.recordKind,
      platform: claimed.platform,
      isFreshlyAutoApproved: false,
    };
  }

  const proposal = proposeMapping(fieldProfiles);
  const approved = proposal.confidence >= MAPPING_AUTO_APPROVE_CONFIDENCE;

  const [profile] = await db()
    .insert(schema.mappingProfiles)
    .values({
      name: `auto:${datasetId.slice(0, 8)}`,
      sourceKind,
      rules: proposal.rules,
      autoGenerated: true,
      confidence: proposal.confidence,
      approvedAt: approved ? new Date() : null,
    })
    .onConflictDoNothing()
    .returning();

  if (!profile) {
    return {
      rules: null,
      profileId: null,
      passthrough: true,
      recordKind: "content_post",
      platform: "facebook",
      isFreshlyAutoApproved: false,
    };
  }

  log.info(
    "mapping",
    approved
      ? `Auto-generated mapping profile accepted (confidence ${proposal.confidence})`
      : `Auto-generated mapping profile needs review (confidence ${proposal.confidence})`,
    { unmatched: proposal.unmatched },
  );

  return {
    rules: approved ? proposal.rules : null,
    profileId: profile.id,
    passthrough: true,
    // Auto-proposal has no signal to distinguish an engagement shape from a
    // content shape, or which platform produced it — that classification
    // requires a human, same as a curated profile's matchPaths already does.
    // Always content_post/facebook until reviewed.
    recordKind: profile.recordKind,
    platform: profile.platform,
    isFreshlyAutoApproved: approved,
  };
}

/** Datasets whose next sync is due, oldest first. */
export async function dueDatasets(limit = 10): Promise<string[]> {
  const rows = await db()
    .select({ id: schema.datasets.id })
    .from(schema.datasets)
    .where(
      and(
        eq(schema.datasets.status, "active"),
        eq(schema.datasets.autoSyncEnabled, true),
        or(isNull(schema.datasets.nextSyncDueAt), lte(schema.datasets.nextSyncDueAt, new Date())),
      ),
    )
    .orderBy(asc(sql`coalesce(${schema.datasets.nextSyncDueAt}, '-infinity'::timestamptz)`))
    .limit(limit);

  return rows.map((r) => r.id);
}
