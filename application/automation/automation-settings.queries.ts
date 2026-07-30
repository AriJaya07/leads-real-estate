import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { AutomationSettingsRow } from "@/infrastructure/db/schema/automation";

const DEFAULTS: Omit<AutomationSettingsRow, "companyId" | "updatedAt"> = {
  autoAssignEnabled: false,
  reminderEnabled: false,
  reminderStaleDays: 3,
  reminderRecipients: [],
  reminderLastSentAt: null,
  weeklyReportEnabled: false,
  weeklyReportRecipients: [],
  weeklyReportLastSentAt: null,
  webhookEnabled: false,
  webhookUrl: null,
  webhookSecret: null,
};

/**
 * "No row" and "row with every automation off" are the same thing to every
 * caller — see the schema comment on `automation_settings`. Every other
 * automation module calls this rather than querying the table directly, so
 * that equivalence only needs to be true in one place.
 */
export async function getAutomationSettings(companyId: string): Promise<AutomationSettingsRow> {
  const [row] = await db()
    .select()
    .from(schema.automationSettings)
    .where(eq(schema.automationSettings.companyId, companyId))
    .limit(1);
  return row ?? { companyId, updatedAt: new Date(), ...DEFAULTS };
}
