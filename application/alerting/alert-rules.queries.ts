import "server-only";
import { asc, eq } from "drizzle-orm";
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
