import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { AutomationRuleRow } from "@/infrastructure/db/schema/automation";

/** Company-scoped, same posture as `listAlertRules` — a small, admin-only list, read live. */
export async function listAutomationRules(companyId: string): Promise<AutomationRuleRow[]> {
  return db()
    .select()
    .from(schema.automationRules)
    .where(eq(schema.automationRules.companyId, companyId))
    .orderBy(asc(schema.automationRules.priority), asc(schema.automationRules.name));
}
