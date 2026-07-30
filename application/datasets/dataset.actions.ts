"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { managerActionClient, ActionError } from "@/application/safe-action";
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
 * the registry. Every action verifies its `datasetId` belongs to
 * `ctx.user.companyId` before touching it — the fix for a real cross-tenant
 * bug: none of these used to check ownership at all, so any admin could
 * sync/pause/archive another company's dataset by guessing its UUID. See
 * docs/saas-platform-architecture.md.
 */

async function assertOwnsDataset(companyId: string, datasetId: string) {
  const [dataset] = await db()
    .select({ id: schema.datasets.id })
    .from(schema.datasets)
    .where(and(eq(schema.datasets.id, datasetId), eq(schema.datasets.companyId, companyId)))
    .limit(1);
  if (!dataset) throw new ActionError("Dataset not found.");
}

export const runDiscovery = managerActionClient.action(async ({ ctx }) => {
  const results = await discoverAllSources(ctx.user.companyId);
  updateTag(datasetsRegistryTag());
  return {
    added: results.reduce((sum, r) => sum + r.added, 0),
    seen: results.reduce((sum, r) => sum + r.seen, 0),
    errors: results.flatMap((r) => r.errors),
  };
});

export const runSync = managerActionClient
  .inputSchema(z.object({ datasetId: z.string().uuid(), force: z.boolean().default(true) }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsDataset(ctx.user.companyId, parsedInput.datasetId);

    const outcome = await syncDataset(parsedInput.datasetId, "manual", {
      force: parsedInput.force,
    });
    updateTag(datasetTag(parsedInput.datasetId));
    updateTag(datasetsRegistryTag());
    updateTag(leadsTag());
    return outcome;
  });

export const setDatasetStatus = managerActionClient
  .inputSchema(
    z.object({
      datasetId: z.string().uuid(),
      status: z.enum(["active", "paused", "archived"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsDataset(ctx.user.companyId, parsedInput.datasetId);

    await db()
      .update(schema.datasets)
      .set({ status: parsedInput.status, updatedAt: new Date() })
      .where(eq(schema.datasets.id, parsedInput.datasetId));

    updateTag(datasetsRegistryTag());
    updateTag(leadsTag());
    return { ok: true };
  });

export const configureSync = managerActionClient
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
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsDataset(ctx.user.companyId, parsedInput.datasetId);

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
export const acceptSchemaVersion = managerActionClient
  .inputSchema(z.object({ versionId: z.string().uuid(), datasetId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsDataset(ctx.user.companyId, parsedInput.datasetId);

    const [updated] = await db()
      .update(schema.datasetVersions)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.datasetVersions.id, parsedInput.versionId),
          eq(schema.datasetVersions.companyId, ctx.user.companyId),
        ),
      )
      .returning({ id: schema.datasetVersions.id });
    if (!updated) throw new ActionError("Schema version not found.");

    await db()
      .update(schema.datasets)
      .set({ health: "healthy", healthDetail: "Schema change reviewed and accepted" })
      .where(eq(schema.datasets.id, parsedInput.datasetId));

    updateTag(datasetTag(parsedInput.datasetId));
    updateTag(datasetsRegistryTag());
    return { ok: true };
  });

/**
 * `mapping_profiles` is global reference data (a curated payload-shape mapping
 * is valid for every company using the same connector actor, not
 * company-specific), so approval isn't ownership-checked against a company —
 * only that the *dataset* claiming it belongs to the caller.
 */
export const approveMappingProfile = managerActionClient
  .inputSchema(z.object({ profileId: z.string().uuid(), datasetId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertOwnsDataset(ctx.user.companyId, parsedInput.datasetId);

    await db()
      .update(schema.mappingProfiles)
      .set({ approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.mappingProfiles.id, parsedInput.profileId));

    updateTag(datasetTag(parsedInput.datasetId));
    return { ok: true };
  });
