"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { authActionClient, ActionError } from "@/application/safe-action";
import { roleAtLeast } from "@/domain/auth/permissions";
import { savedViewsTag } from "@/application/cache-tags";

const savedViewInput = z.object({
  name: z.string().trim().min(1).max(120),
  /** Visible to the whole company, not just the creator — see `saved_views.shared`. */
  shared: z.boolean().default(false),
  /** The exact `URLSearchParams` entries `serializeLeadFilters` would produce — round-tripped as-is through `parseLeadFilters` when applied. */
  filters: z.record(z.string(), z.string()),
  sort: z.string().optional(),
});

/** Any signed-in user can save a search for themselves or, opt-in, share it with the company. */
export const createSavedView = authActionClient
  .inputSchema(savedViewInput)
  .action(async ({ parsedInput, ctx }) => {
    const [created] = await db()
      .insert(schema.savedViews)
      .values({
        companyId: ctx.user.companyId,
        ownerId: ctx.user.userId,
        name: parsedInput.name,
        shared: parsedInput.shared,
        filters: parsedInput.filters,
        sort: parsedInput.sort ?? null,
      })
      .returning({ id: schema.savedViews.id });

    updateTag(savedViewsTag());
    return { id: created.id };
  });

/** Deleting someone else's shared view requires manager+ — deleting your own never does. */
export const deleteSavedView = authActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [view] = await db()
      .select({ id: schema.savedViews.id, ownerId: schema.savedViews.ownerId })
      .from(schema.savedViews)
      .where(and(eq(schema.savedViews.id, parsedInput.id), eq(schema.savedViews.companyId, ctx.user.companyId)))
      .limit(1);
    if (!view) throw new ActionError("Saved search not found.");

    const isOwner = view.ownerId === ctx.user.userId;
    if (!isOwner && !roleAtLeast(ctx.user.role, "manager")) {
      throw new ActionError("Only its owner or a manager can delete this saved search.");
    }

    await db()
      .delete(schema.savedViews)
      .where(and(eq(schema.savedViews.id, parsedInput.id), eq(schema.savedViews.companyId, ctx.user.companyId)));

    updateTag(savedViewsTag());
    return { ok: true };
  });
