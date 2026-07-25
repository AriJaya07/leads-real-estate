"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient } from "@/application/safe-action";
import { syncDataset } from "@/application/sync/sync-dataset";
import { discoverAllSources } from "@/application/sync/discovery";
import { datasetTag, datasetsRegistryTag, leadsTag } from "@/application/cache-tags";
import {
  MAX_SYNC_INTERVAL_SECONDS,
  MIN_SYNC_INTERVAL_SECONDS,
} from "@/shared/constants";

/**
 * Every operation an admin needs to manage datasets, exposed as actions rather
 * than requiring a code change or an env var edit — which is the entire point of
 * the registry.
 */

export const runDiscovery = adminActionClient.action(async () => {
  const results = await discoverAllSources();
  updateTag(datasetsRegistryTag());
  return {
    added: results.reduce((sum, r) => sum + r.added, 0),
    seen: results.reduce((sum, r) => sum + r.seen, 0),
    errors: results.flatMap((r) => r.errors),
  };
});

export const runSync = adminActionClient
  .inputSchema(z.object({ datasetId: z.string().uuid(), force: z.boolean().default(true) }))
  .action(async ({ parsedInput }) => {
    const outcome = await syncDataset(parsedInput.datasetId, "manual", {
      force: parsedInput.force,
    });
    updateTag(datasetTag(parsedInput.datasetId));
    updateTag(datasetsRegistryTag());
    updateTag(leadsTag());
    return outcome;
  });

export const setDatasetStatus = adminActionClient
  .inputSchema(
    z.object({
      datasetId: z.string().uuid(),
      status: z.enum(["active", "paused", "archived"]),
    }),
  )
  .action(async ({ parsedInput }) => {
    await db()
      .update(schema.datasets)
      .set({ status: parsedInput.status, updatedAt: new Date() })
      .where(eq(schema.datasets.id, parsedInput.datasetId));

    updateTag(datasetsRegistryTag());
    updateTag(leadsTag());
    return { ok: true };
  });

export const configureSync = adminActionClient
  .inputSchema(
    z.object({
      datasetId: z.string().uuid(),
      autoSyncEnabled: z.boolean(),
      syncIntervalSeconds: z.coerce
        .number()
        .int()
        .min(MIN_SYNC_INTERVAL_SECONDS)
        .max(MAX_SYNC_INTERVAL_SECONDS),
    }),
  )
  .action(async ({ parsedInput }) => {
    await db()
      .update(schema.datasets)
      .set({
        autoSyncEnabled: parsedInput.autoSyncEnabled,
        syncIntervalSeconds: parsedInput.syncIntervalSeconds,
        updatedAt: new Date(),
      })
      .where(eq(schema.datasets.id, parsedInput.datasetId));

    updateTag(datasetsRegistryTag());
    return { ok: true };
  });

/**
 * Accepting a schema version clears the drift flag. The point of drift detection
 * is that a human confirms the mapping still holds — so acceptance is explicit,
 * never automatic.
 */
export const acceptSchemaVersion = adminActionClient
  .inputSchema(z.object({ versionId: z.string().uuid(), datasetId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await db()
      .update(schema.datasetVersions)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.datasetVersions.id, parsedInput.versionId));

    await db()
      .update(schema.datasets)
      .set({ health: "healthy", healthDetail: "Schema change reviewed and accepted" })
      .where(eq(schema.datasets.id, parsedInput.datasetId));

    updateTag(datasetTag(parsedInput.datasetId));
    updateTag(datasetsRegistryTag());
    return { ok: true };
  });

export const approveMappingProfile = adminActionClient
  .inputSchema(z.object({ profileId: z.string().uuid(), datasetId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await db()
      .update(schema.mappingProfiles)
      .set({ approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.mappingProfiles.id, parsedInput.profileId));

    updateTag(datasetTag(parsedInput.datasetId));
    return { ok: true };
  });
