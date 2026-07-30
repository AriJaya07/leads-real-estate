"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { db, schema } from "@/infrastructure/db/client";
import { authActionClient, ActionError } from "@/application/safe-action";
import { leadTag, leadsTag } from "@/application/cache-tags";
import { dispatchWebhooksForLeads } from "@/application/automation/webhook-dispatch";
import { LEAD_STATUSES } from "./lead-status";

/**
 * Verifies the lead belongs to the caller's company before touching it, then
 * creates its `lead_states` row if this is the first time anyone's touched it
 * — the fix for a real cross-tenant bug: every action here used to trust a
 * bare `leadId` with no ownership check at all, so any signed-in user could
 * mutate any company's lead by guessing a UUID. See
 * docs/saas-platform-architecture.md.
 */
async function ensureState(companyId: string, leadId: string) {
  const [lead] = await db()
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.companyId, companyId)))
    .limit(1);
  if (!lead) throw new ActionError("Lead not found.");

  await db().insert(schema.leadStates).values({ leadId, companyId }).onConflictDoNothing();
}

/**
 * `updateTag` rather than `revalidateTag`: an agent changing a lead's status
 * must see their own change immediately, not stale-while-revalidate content.
 */
function invalidate(leadId: string) {
  updateTag(leadTag(leadId));
  updateTag(leadsTag());
}

export const setLeadStatus = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid(), status: z.enum(LEAD_STATUSES) }))
  .action(async ({ parsedInput, ctx }) => {
    await ensureState(ctx.user.companyId, parsedInput.leadId);
    await db()
      .update(schema.leadStates)
      .set({
        status: parsedInput.status,
        // Every transition *to* closed stamps a fresh revenue-recognition
        // timestamp — including re-closing after a reopen, a legitimate new
        // closing event, not a correction of the old one. Any other status
        // leaves it untouched, so "when did this last close" survives a
        // reopen until it closes again.
        dealClosedAt: parsedInput.status === "closed" ? new Date() : sql`${schema.leadStates.dealClosedAt}`,
        updatedBy: ctx.user.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.leadStates.leadId, parsedInput.leadId));

    await db().insert(schema.leadEvents).values({
      companyId: ctx.user.companyId,
      leadId: parsedInput.leadId,
      type: "status_changed",
      actorId: ctx.user.userId,
      payload: { status: parsedInput.status },
    });

    // `after()`, not a bare fire-and-forget call: a serverless invocation can
    // be frozen/torn down the moment this action returns, which would cancel
    // an un-awaited promise before the webhook fetch completes. Same pattern
    // `app/api/webhooks/apify/route.ts` uses for its own post-response work.
    // A slow/down customer endpoint must not make this button feel slow, and
    // `dispatchWebhooksForLeads` never throws.
    after(() => dispatchWebhooksForLeads(ctx.user.companyId, [parsedInput.leadId], "lead.status_changed"));

    invalidate(parsedInput.leadId);
    return { ok: true };
  });

/**
 * Records (or clears, via `dealValueUsd: null`) the actual closed-deal value
 * — the input to every revenue/ROI figure in `application/analytics/`.
 * Callable regardless of current status: a deal's value is often known
 * before the status is flipped to `closed`, or corrected afterward.
 */
export const setDealValue = authActionClient
  .inputSchema(
    z.object({
      leadId: z.string().uuid(),
      dealValueUsd: z.coerce.number().int().min(0).max(1_000_000_000).nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await ensureState(ctx.user.companyId, parsedInput.leadId);
    await db()
      .update(schema.leadStates)
      .set({ dealValueUsd: parsedInput.dealValueUsd, updatedBy: ctx.user.userId, updatedAt: new Date() })
      .where(eq(schema.leadStates.leadId, parsedInput.leadId));

    invalidate(parsedInput.leadId);
    return { ok: true };
  });

export const assignLead = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid(), userId: z.string().uuid().nullable() }))
  .action(async ({ parsedInput, ctx }) => {
    await ensureState(ctx.user.companyId, parsedInput.leadId);

    if (parsedInput.userId) {
      const [assignee] = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, parsedInput.userId), eq(schema.users.companyId, ctx.user.companyId)))
        .limit(1);
      if (!assignee) throw new ActionError("That teammate was not found.");
    }

    await db()
      .update(schema.leadStates)
      .set({ assignedTo: parsedInput.userId, updatedBy: ctx.user.userId, updatedAt: new Date() })
      .where(eq(schema.leadStates.leadId, parsedInput.leadId));

    await db().insert(schema.leadEvents).values({
      companyId: ctx.user.companyId,
      leadId: parsedInput.leadId,
      type: "assigned",
      actorId: ctx.user.userId,
      payload: { assignedTo: parsedInput.userId },
    });

    invalidate(parsedInput.leadId);
    return { ok: true };
  });

/**
 * Records that an agent reached out. This is the measurement point for
 * time-to-first-touch — the platform's north-star metric — which is why it is
 * stamped by the contact action itself rather than asking anyone to log it.
 */
export const markContacted = authActionClient
  .inputSchema(
    z.object({
      leadId: z.string().uuid(),
      channel: z.enum(["whatsapp", "phone", "email", "post"]).default("whatsapp"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await ensureState(ctx.user.companyId, parsedInput.leadId);

    await db()
      .update(schema.leadStates)
      .set({
        // Only the *first* touch counts; later contacts must not reset the clock.
        firstContactedAt: sql`coalesce(${schema.leadStates.firstContactedAt}, now())`,
        status: sql`CASE WHEN ${schema.leadStates.status} = 'new' THEN 'contacted'::lead_status ELSE ${schema.leadStates.status} END`,
        assignedTo: sql`coalesce(${schema.leadStates.assignedTo}, ${ctx.user.userId}::uuid)`,
        updatedBy: ctx.user.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.leadStates.leadId, parsedInput.leadId));

    await db().insert(schema.leadEvents).values({
      companyId: ctx.user.companyId,
      leadId: parsedInput.leadId,
      type: "contacted",
      actorId: ctx.user.userId,
      payload: { channel: parsedInput.channel },
    });

    invalidate(parsedInput.leadId);
    return { ok: true };
  });

export const saveLeadNotes = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid(), notes: z.string().max(10_000) }))
  .action(async ({ parsedInput, ctx }) => {
    await ensureState(ctx.user.companyId, parsedInput.leadId);
    await db()
      .update(schema.leadStates)
      .set({ notes: parsedInput.notes, updatedBy: ctx.user.userId, updatedAt: new Date() })
      .where(eq(schema.leadStates.leadId, parsedInput.leadId));

    await db().insert(schema.leadEvents).values({
      companyId: ctx.user.companyId,
      leadId: parsedInput.leadId,
      type: "note_added",
      actorId: ctx.user.userId,
    });

    invalidate(parsedInput.leadId);
    return { ok: true };
  });

export const toggleBookmark = authActionClient
  .inputSchema(z.object({ leadId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await ensureState(ctx.user.companyId, parsedInput.leadId);
    await db()
      .update(schema.leadStates)
      .set({
        bookmarked: sql`NOT ${schema.leadStates.bookmarked}`,
        updatedBy: ctx.user.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.leadStates.leadId, parsedInput.leadId));

    invalidate(parsedInput.leadId);
    return { ok: true };
  });
