import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { getRevenueSummary } from "./revenue";
import { resetDb } from "@/test/integration/db-helpers";

const DAY_MS = 86_400_000;

async function seedCompanyOnPlan(monthlyPriceUsd: number | null) {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Revenue Test Co ${crypto.randomUUID()}`, slug: `revenue-test-${crypto.randomUUID()}` })
    .returning();
  const [plan] = await db()
    .insert(schema.plans)
    .values({
      name: `Revenue Test Plan ${crypto.randomUUID()}`,
      monthlyPriceUsd,
      maxSeats: 10,
      maxDatasets: 10,
      maxRawRecordsPerMonth: 10_000,
      maxLeadsPerMonth: 1_000,
      maxAlertRules: 10,
      maxApifyRequestsPerMonth: 10_000,
      maxStorageKb: 1_000_000,
      dataRetentionDays: 90,
    })
    .returning();
  await db().insert(schema.subscriptions).values({ companyId: company.id, planId: plan.id, status: "active" });
  return company.id;
}

async function seedClosedDeal(companyId: string, dealValueUsd: number, dealClosedAt: Date) {
  const [lead] = await db().insert(schema.leads).values({ companyId }).returning();
  await db().insert(schema.leadStates).values({ leadId: lead.id, companyId, status: "closed", dealValueUsd, dealClosedAt });
}

describe("getRevenueSummary", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("sums total and recent revenue correctly, and computes ROI against the plan's actual price", async () => {
    const companyId = await seedCompanyOnPlan(399);
    const now = new Date();

    await seedClosedDeal(companyId, 1_000, new Date(now.getTime() - 5 * DAY_MS)); // within 30 days
    await seedClosedDeal(companyId, 2_000, new Date(now.getTime() - 10 * DAY_MS)); // within 30 days
    await seedClosedDeal(companyId, 3_000, new Date(now.getTime() - 45 * DAY_MS)); // outside 30 days

    const summary = await getRevenueSummary(companyId, 30);

    expect(summary.totalRevenueUsd).toBe(6_000); // all three, regardless of when
    expect(summary.closedDealCount).toBe(3);
    expect(summary.avgDealValueUsd).toBe(2_000); // 6000 / 3

    expect(summary.revenueLast30Days).toBe(3_000); // only the two within 30 days
    expect(summary.dealsLast30Days).toBe(2);

    expect(summary.monthlyPlanCostUsd).toBe(399);
    expect(summary.roiMultiple).toBeCloseTo(3_000 / 399, 5);

    // Trend covers exactly the requested window and sums to the recent total.
    expect(summary.trend).toHaveLength(30);
    expect(summary.trend.reduce((sum, point) => sum + point.revenueUsd, 0)).toBe(3_000);
  });

  it("does not count non-closed leads toward revenue even if they somehow carry a dealValueUsd", async () => {
    const companyId = await seedCompanyOnPlan(399);
    const [lead] = await db().insert(schema.leads).values({ companyId }).returning();
    await db()
      .insert(schema.leadStates)
      .values({ leadId: lead.id, companyId, status: "negotiation", dealValueUsd: 50_000 });

    const summary = await getRevenueSummary(companyId);

    expect(summary.totalRevenueUsd).toBe(0);
    expect(summary.closedDealCount).toBe(0);
    expect(summary.avgDealValueUsd).toBeNull();
  });

  it("returns roiMultiple: null when there's no active subscription", async () => {
    const [company] = await db()
      .insert(schema.companies)
      .values({ name: `No Plan Co ${crypto.randomUUID()}`, slug: `no-plan-${crypto.randomUUID()}` })
      .returning();

    const summary = await getRevenueSummary(company.id);

    expect(summary.monthlyPlanCostUsd).toBeNull();
    expect(summary.roiMultiple).toBeNull();
  });
});
