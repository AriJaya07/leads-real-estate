import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { sendWeeklyReport } from "@/application/automation/send-weekly-report";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:weekly-report");

/** n8n-triggered weekly report sweep — self-throttled to at most once every 7 days per company, so this is safe to call daily. */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const companies = await db()
    .select({ companyId: schema.automationSettings.companyId })
    .from(schema.automationSettings)
    .where(eq(schema.automationSettings.weeklyReportEnabled, true));

  let sent = 0;
  let failures = 0;
  for (const { companyId } of companies) {
    try {
      const result = await sendWeeklyReport(companyId);
      if (result.sent) sent += 1;
    } catch (error) {
      failures += 1;
      log.error("weekly report failed for company", { companyId, error });
    }
  }

  return NextResponse.json({ ok: true, companies: companies.length, sent, failures });
}
