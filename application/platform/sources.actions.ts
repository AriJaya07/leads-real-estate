"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { platformActionClient, ActionError } from "@/application/safe-action";
import { actorTemplatesTag } from "@/application/cache-tags";
import { actorTemplateInput } from "@/application/collection/actor-template-input.schema";

/**
 * Super Admin's write surface over the global `actor_templates` catalog —
 * "which sources (Facebook, Instagram, TikTok, ...) exist and which actor
 * scrapes each one" as a platform-wide decision, not a per-tenant one. Same
 * table `application/collection/actor-templates.actions.ts` writes from a
 * tenant admin's `/admin/collection`; this is the separately audited
 * platform-operator entry point — see `platformSourceActions` in
 * infrastructure/db/schema/platform.ts for why the audit trail is a distinct
 * table from `super_admin_actions` (these writes are never company-scoped).
 */

async function logAction(
  platformAdminUserId: string,
  action: "register_actor" | "update_actor" | "set_enabled",
  actorTemplateId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  await db().insert(schema.platformSourceActions).values({ platformAdminUserId, action, actorTemplateId, details });
}

export const registerSourceTemplate = platformActionClient
  .inputSchema(actorTemplateInput)
  .action(async ({ parsedInput, ctx }) => {
    const [created] = await db()
      .insert(schema.actorTemplates)
      .values(parsedInput)
      .onConflictDoNothing({ target: schema.actorTemplates.name })
      .returning({ id: schema.actorTemplates.id });
    if (!created) throw new ActionError(`An actor template named "${parsedInput.name}" already exists.`);

    await logAction(ctx.user.userId, "register_actor", created.id, {
      name: parsedInput.name,
      platform: parsedInput.platform,
      actorId: parsedInput.actorId,
    });
    updateTag(actorTemplatesTag());
    return { id: created.id };
  });

export const updateSourceTemplate = platformActionClient
  .inputSchema(actorTemplateInput.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...rest } = parsedInput;
    const [updated] = await db()
      .update(schema.actorTemplates)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(schema.actorTemplates.id, id))
      .returning({ id: schema.actorTemplates.id });
    if (!updated) throw new ActionError("Actor template not found.");

    await logAction(ctx.user.userId, "update_actor", id, { name: rest.name, platform: rest.platform });
    updateTag(actorTemplatesTag());
    return { ok: true };
  });

export const setSourceTemplateEnabled = platformActionClient
  .inputSchema(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const [updated] = await db()
      .update(schema.actorTemplates)
      .set({ enabled: parsedInput.enabled, updatedAt: new Date() })
      .where(eq(schema.actorTemplates.id, parsedInput.id))
      .returning({ id: schema.actorTemplates.id, name: schema.actorTemplates.name });
    if (!updated) throw new ActionError("Actor template not found.");

    await logAction(ctx.user.userId, "set_enabled", updated.id, { name: updated.name, enabled: parsedInput.enabled });
    updateTag(actorTemplatesTag());
    return { ok: true };
  });
