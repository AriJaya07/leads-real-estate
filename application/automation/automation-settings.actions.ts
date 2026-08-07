"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { updateTag } from "next/cache";
import { db, schema } from "@/infrastructure/db/client";
import { adminActionClient } from "@/application/safe-action";
import { automationSettingsTag } from "@/application/cache-tags";
import { isPrivateOrLoopbackWebhookUrl } from "@/domain/http/webhook-url";

const settingsInput = z
  .object({
    autoAssignEnabled: z.boolean(),
    reminderEnabled: z.boolean(),
    reminderStaleDays: z.coerce.number().int().min(1).max(90),
    reminderRecipients: z.array(z.string().trim().email().max(200)).default([]),
    weeklyReportEnabled: z.boolean(),
    weeklyReportRecipients: z.array(z.string().trim().email().max(200)).default([]),
    webhookEnabled: z.boolean(),
    webhookUrl: z.string().trim().max(500).optional(),
  })
  .refine((v) => !v.reminderEnabled || v.reminderRecipients.length > 0, {
    message: "Add at least one recipient to enable reminders.",
    path: ["reminderRecipients"],
  })
  .refine((v) => !v.weeklyReportEnabled || v.weeklyReportRecipients.length > 0, {
    message: "Add at least one recipient to enable the weekly report.",
    path: ["weeklyReportRecipients"],
  })
  .refine((v) => !v.webhookEnabled || Boolean(v.webhookUrl && /^https?:\/\//.test(v.webhookUrl)), {
    message: "Enter a valid http(s) webhook URL to enable webhooks.",
    path: ["webhookUrl"],
  })
  .refine((v) => !v.webhookEnabled || !v.webhookUrl || !isPrivateOrLoopbackWebhookUrl(v.webhookUrl), {
    message: "Webhook URL can't point at a private, loopback, or link-local address.",
    path: ["webhookUrl"],
  });

/** One settings form, one upsert — `automation_settings` is a 1:1 extension table, not a list. */
export const updateAutomationSettings = adminActionClient
  .inputSchema(settingsInput)
  .action(async ({ parsedInput, ctx }) => {
    const values = { ...parsedInput, webhookUrl: parsedInput.webhookUrl || null, updatedAt: new Date() };

    await db()
      .insert(schema.automationSettings)
      .values({ companyId: ctx.user.companyId, ...values })
      .onConflictDoUpdate({ target: schema.automationSettings.companyId, set: values });

    updateTag(automationSettingsTag(ctx.user.companyId));
    return { ok: true };
  });

/** Separate from the settings form on purpose — rotating the secret is a deliberate, visible action, not a side effect of saving unrelated fields. */
export const regenerateWebhookSecret = adminActionClient.action(async ({ ctx }) => {
  const secret = randomBytes(24).toString("hex");
  const values = { webhookSecret: secret, updatedAt: new Date() };

  await db()
    .insert(schema.automationSettings)
    .values({ companyId: ctx.user.companyId, ...values })
    .onConflictDoUpdate({ target: schema.automationSettings.companyId, set: values });

  updateTag(automationSettingsTag(ctx.user.companyId));
  return { secret };
});
