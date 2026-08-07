import "server-only";
import { db, schema } from "@/infrastructure/db/client";
import { getLeadsForDigest } from "@/application/leads/lead-queries";
import { sendWebhook, type OutboundWebhookPayload } from "@/infrastructure/webhooks/outbound-webhook";
import { createLogger } from "@/infrastructure/observability/logger";
import { getAutomationSettings } from "./automation-settings.queries";

const log = createLogger("automation:webhooks");

/**
 * Records one delivery attempt for the API keys page's "Recent deliveries"
 * card. Swallows its own error the same way `application/billing/usage.ts`'s
 * increment functions do — a logging failure must never be the reason a
 * webhook (or its retry) appears to fail.
 */
export async function recordDelivery(
  companyId: string,
  url: string,
  payload: OutboundWebhookPayload,
  result: { ok: boolean; status?: number; error?: string },
): Promise<void> {
  try {
    await db().insert(schema.webhookDeliveries).values({
      companyId,
      event: payload.event,
      url,
      payload,
      ok: result.ok,
      statusCode: result.status ?? null,
      error: result.error ?? null,
    });
  } catch (error) {
    log.warn("failed to record webhook delivery", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type WebhookEvent = "lead.created_or_updated" | "lead.status_changed";

/**
 * Fires an outbound webhook for a batch of leads, if the company has one
 * configured. Reuses `getLeadsForDigest`'s projection — the same "what does
 * an external system need to know about this lead" shape the alert digest
 * already sends by email — rather than inventing a third representation of a
 * lead. Never throws: a delivery failure (or no webhook configured at all,
 * the common case) is invisible to whatever triggered this, matching
 * `dispatchAlertsForLeads`'s own "must never break the pipeline" posture.
 */
export async function dispatchWebhooksForLeads(
  companyId: string,
  leadIds: string[],
  event: WebhookEvent,
): Promise<void> {
  if (leadIds.length === 0) return;

  try {
    const settings = await getAutomationSettings(companyId);
    if (!settings.webhookEnabled || !settings.webhookUrl) return;

    const leads = await getLeadsForDigest(companyId, leadIds);
    if (leads.length === 0) return;

    const payload: OutboundWebhookPayload = {
      event,
      companyId,
      timestamp: new Date().toISOString(),
      data: leads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        leadType: lead.leadType,
        buyerScore: lead.buyerScore,
        confidenceScore: lead.confidenceScore,
        propertyTypes: lead.propertyTypes,
        locations: lead.locations,
        budgetMin: lead.budgetUsdMin ?? lead.budgetMin,
        budgetMax: lead.budgetUsdMax ?? lead.budgetMax,
        budgetCurrency: lead.budgetUsdMin !== null || lead.budgetUsdMax !== null ? "USD" : lead.budgetCurrency,
        contact: lead.contact,
      })),
    };

    const result = await sendWebhook(settings.webhookUrl, settings.webhookSecret, payload);
    await recordDelivery(companyId, settings.webhookUrl, payload, result);

    if (!result.ok) {
      log.warn("webhook dispatch failed", { companyId, event, error: result.error, status: result.status });
    }
  } catch (error) {
    log.warn("webhook dispatch threw", {
      companyId,
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
