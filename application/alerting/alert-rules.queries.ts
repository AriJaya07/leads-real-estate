import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
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

/**
 * "Fired N× this week" per rule, for the alert rule manager. A live `COUNT`
 * over `alert_deliveries` grouped by rule — same posture as
 * `assertWithinLimit`'s seats/datasets check (docs/pricing-strategy.md §3): a
 * small, cheap-to-scan table read at request time, so this can never drift
 * from a maintained counter the way an incremented `firedCount` column could.
 * Deliveries are already deduped on insert (`dispatch.ts`'s `dedupeKey`), so
 * this never double-counts a retried send.
 */
export async function getAlertRuleFireCounts(companyId: string): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db()
    .select({
      alertRuleId: schema.alertDeliveries.alertRuleId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.alertDeliveries)
    .where(and(eq(schema.alertDeliveries.companyId, companyId), gte(schema.alertDeliveries.createdAt, since)))
    .groupBy(schema.alertDeliveries.alertRuleId);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.alertRuleId) counts[row.alertRuleId] = row.count;
  }
  return counts;
}
