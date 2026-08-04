import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { AlertRuleRow } from "@/infrastructure/db/schema/alerts";

/** Company-scoped, same posture as `listTeamMembers` — a small, admin-only list, read live. */
export async function listAlertRules(companyId: string): Promise<AlertRuleRow[]> {
  return db()
    .select()
    .from(schema.alertRules)
    .where(eq(schema.alertRules.companyId, companyId))
    .orderBy(asc(schema.alertRules.name));
}

export interface RecentAlertDelivery {
  id: string;
  ruleName: string | null;
  leadName: string | null;
  channel: string;
  status: string;
  createdAt: Date;
}

/**
 * Backs the topbar notification panel — real delivery history, not a mock
 * feed. Deliberately no read/unread column on `alert_deliveries`; "unread" is
 * tracked client-side only (see `features/shell/components/notification-panel.tsx`),
 * same "design the surface, don't over-build the backend" posture the rest of
 * this pass takes with `/admin/api-keys`.
 */
export async function listRecentAlertDeliveries(
  companyId: string,
  limit = 10,
): Promise<RecentAlertDelivery[]> {
  const rows = await db()
    .select({
      id: schema.alertDeliveries.id,
      ruleName: schema.alertRules.name,
      leadName: schema.leads.name,
      channel: schema.alertDeliveries.channel,
      status: schema.alertDeliveries.status,
      createdAt: schema.alertDeliveries.createdAt,
    })
    .from(schema.alertDeliveries)
    .leftJoin(schema.alertRules, eq(schema.alertRules.id, schema.alertDeliveries.alertRuleId))
    .leftJoin(schema.leads, eq(schema.leads.id, schema.alertDeliveries.leadId))
    .where(eq(schema.alertDeliveries.companyId, companyId))
    .orderBy(desc(schema.alertDeliveries.createdAt))
    .limit(limit);

  return rows;
}
