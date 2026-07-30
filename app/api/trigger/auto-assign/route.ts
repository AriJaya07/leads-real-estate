import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { runAutoAssignment } from "@/application/automation/auto-assign";
import { extractSecretHeader, secretsMatch } from "@/application/http/verify-secret";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("trigger:auto-assign");

/**
 * n8n-triggered auto-assignment sweep, same family as `/api/trigger/sync` and
 * friends. One company's failure doesn't abort the rest — each is its own
 * try/catch, unlike the sync route's single outer one, since these are
 * independent, lower-stakes operations where partial progress is strictly
 * better than none.
 */
export async function POST(request: Request) {
  if (!secretsMatch(extractSecretHeader(request), serverEnv().N8N_TRIGGER_SECRET ?? "")) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const companies = await db()
    .select({ companyId: schema.automationSettings.companyId })
    .from(schema.automationSettings)
    .where(eq(schema.automationSettings.autoAssignEnabled, true));

  let totalAssigned = 0;
  let failures = 0;
  for (const { companyId } of companies) {
    try {
      const result = await runAutoAssignment(companyId);
      totalAssigned += result.assigned;
    } catch (error) {
      failures += 1;
      log.error("auto-assignment failed for company", { companyId, error });
    }
  }

  return NextResponse.json({ ok: true, companies: companies.length, assigned: totalAssigned, failures });
}
