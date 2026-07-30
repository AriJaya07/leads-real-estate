import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { sendWeeklyReport } from "./send-weekly-report";
import { resetDb } from "@/test/integration/db-helpers";

const DAY_MS = 86_400_000;

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Weekly Report Test Co ${crypto.randomUUID()}`, slug: `weekly-report-test-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

describe("sendWeeklyReport", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("does nothing when disabled (the default — no automation_settings row)", async () => {
    const companyId = await seedCompany();
    expect(await sendWeeklyReport(companyId)).toEqual({ sent: false });
  });

  it("does nothing when enabled but no recipients are configured", async () => {
    const companyId = await seedCompany();
    await db()
      .insert(schema.automationSettings)
      .values({ companyId, weeklyReportEnabled: true, weeklyReportRecipients: [] });

    expect(await sendWeeklyReport(companyId)).toEqual({ sent: false });
  });

  // The full happy path (enabled + recipients → actually computes and sends)
  // isn't exercisable at this tier: `sendWeeklyReport` calls `getLeadStats`/
  // `getLeadTrend`, both `"use cache"` functions that require Next's Cache
  // Components runtime — present in a real Route Handler (where
  // `/api/trigger/weekly-report` actually calls this), absent in a bare
  // Vitest process. Every gating branch above it (disabled, no recipients,
  // cooldown) returns before reaching that call and is fully covered here;
  // the "did it actually compute the right numbers" question belongs to an
  // e2e test hitting the real server, same as `getLeadStats` itself only
  // ever gets exercised via `intelligence.spec.ts`, not an integration test.

  it("does not re-run within 7 days of the last attempt", async () => {
    const companyId = await seedCompany();
    await db()
      .insert(schema.automationSettings)
      .values({
        companyId,
        weeklyReportEnabled: true,
        weeklyReportRecipients: ["owner@example.com"],
        weeklyReportLastSentAt: new Date(Date.now() - DAY_MS),
      });

    expect(await sendWeeklyReport(companyId)).toEqual({ sent: false });
  });
});
