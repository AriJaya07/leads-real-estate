"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient, ActionError } from "@/application/safe-action";
import { actorTemplatesTag } from "@/application/cache-tags";
import { actorTemplateInput as templateInput } from "@/application/collection/actor-template-input.schema";

/**
 * Registering "which Apify actor scrapes what" is what replaces a hardcoded
 * `APIFY_ACTOR_ID`/platform branch in code — see domain/collection/actor-request.ts.
 * Admin-only: this directly controls which external actor gets money spent on it
 * every time a manager triggers a scrape, one tier above `runSync`/`runDiscovery`
 * (managerActionClient) for that reason. `application/platform/sources.actions.ts`
 * is the Super Admin counterpart to this same table, audited separately.
 */

export const createActorTemplate = adminActionClient
  .inputSchema(templateInput)
  .action(async ({ parsedInput }) => {
    const [created] = await db()
      .insert(schema.actorTemplates)
      .values(parsedInput)
      .onConflictDoNothing({ target: schema.actorTemplates.name })
      .returning({ id: schema.actorTemplates.id });
    if (!created) throw new ActionError(`An actor template named "${parsedInput.name}" already exists.`);

    updateTag(actorTemplatesTag());
    return { id: created.id };
  });

export const updateActorTemplate = adminActionClient
  .inputSchema(templateInput.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { id, ...rest } = parsedInput;
    const [updated] = await db()
      .update(schema.actorTemplates)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(schema.actorTemplates.id, id))
      .returning({ id: schema.actorTemplates.id });
    if (!updated) throw new ActionError("Actor template not found.");

    updateTag(actorTemplatesTag());
    return { ok: true };
  });

export const setActorTemplateEnabled = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const [updated] = await db()
      .update(schema.actorTemplates)
      .set({ enabled: parsedInput.enabled, updatedAt: new Date() })
      .where(eq(schema.actorTemplates.id, parsedInput.id))
      .returning({ id: schema.actorTemplates.id });
    if (!updated) throw new ActionError("Actor template not found.");

    updateTag(actorTemplatesTag());
    return { ok: true };
  });
