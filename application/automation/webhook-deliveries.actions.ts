"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient, ActionError } from "@/application/safe-action";
import { sendWebhook, type OutboundWebhookPayload } from "@/infrastructure/webhooks/outbound-webhook";
import { getAutomationSettings } from "./automation-settings.queries";
import { recordDelivery } from "./webhook-dispatch";

/**
 * Replays a past delivery's stored payload against the *currently*
 * configured endpoint/secret — not the endpoint it originally failed
 * against, in case an admin already fixed the URL. Writes a fresh delivery
 * row rather than mutating the original, so the log reads as a real
 * attempt history instead of silently rewriting what happened.
 */
export const retryWebhookDelivery = adminActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [delivery] = await db()
      .select()
      .from(schema.webhookDeliveries)
      .where(and(eq(schema.webhookDeliveries.id, parsedInput.id), eq(schema.webhookDeliveries.companyId, ctx.user.companyId)))
      .limit(1);
    if (!delivery) throw new ActionError("Delivery not found.");

    const settings = await getAutomationSettings(ctx.user.companyId);
    if (!settings.webhookUrl) throw new ActionError("No webhook endpoint is configured.");

    const payload = delivery.payload as OutboundWebhookPayload;
    const result = await sendWebhook(settings.webhookUrl, settings.webhookSecret, payload);
    await recordDelivery(ctx.user.companyId, settings.webhookUrl, payload, result);

    if (!result.ok) throw new ActionError(result.error ?? `Endpoint responded ${result.status ?? "with an error"}`);
    return { ok: true };
  });
