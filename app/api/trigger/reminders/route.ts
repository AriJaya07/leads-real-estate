import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { sendStaleLeadReminders } from "@/application/automation/send-reminders";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:reminders");

/** n8n-triggered stale-lead reminder sweep — see application/automation/send-reminders.ts for the self-throttling logic (safe to call more often than `reminderStaleDays`). */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const companies = await db()
    .select({ companyId: schema.automationSettings.companyId })
    .from(schema.automationSettings)
    .where(eq(schema.automationSettings.reminderEnabled, true));

  let sent = 0;
  let failures = 0;
  for (const { companyId } of companies) {
    try {
      const result = await sendStaleLeadReminders(companyId);
      if (result.sent) sent += 1;
    } catch (error) {
      failures += 1;
      log.error("reminder sweep failed for company", { companyId, error });
    }
  }

  return NextResponse.json({ ok: true, companies: companies.length, sent, failures });
}
