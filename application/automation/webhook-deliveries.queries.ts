import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { WebhookDeliveryRow } from "@/infrastructure/db/schema/automation";

/** Backs the API keys page's "Recent deliveries" card — company-scoped, most recent first. */
export async function listRecentWebhookDeliveries(companyId: string, limit = 10): Promise<WebhookDeliveryRow[]> {
  return db()
    .select()
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.companyId, companyId))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(limit);
}
