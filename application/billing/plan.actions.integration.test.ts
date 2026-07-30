import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { listPlans, validatePlanChange } from "./plan.actions";
import { incrementApifyRequestUsage, incrementMonthlyLeadUsage, incrementRawRecordUsage } from "./usage";
import { resetDb } from "@/test/integration/db-helpers";

async function seedPlan(overrides: Partial<typeof schema.plans.$inferInsert> = {}) {
  const [plan] = await db()
    .insert(schema.plans)
    .values({
      name: `Test Plan ${crypto.randomUUID()}`,
      maxSeats: 5,
      maxDatasets: 5,
      maxRawRecordsPerMonth: 1000,
      maxLeadsPerMonth: 100,
      maxAlertRules: 10,
      maxApifyRequestsPerMonth: 1000,
      maxStorageKb: 1_000_000,
      dataRetentionDays: 365,
      ...overrides,
    })
    .returning();
  return plan;
}

async function seedCompanyOnPlan(planOverrides: Partial<typeof schema.plans.$inferInsert> = {}) {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Plan Test Co ${crypto.randomUUID()}`, slug: `plan-test-${crypto.randomUUID()}` })
    .returning();
  const plan = await seedPlan(planOverrides);
  await db().insert(schema.subscriptions).values({ companyId: company.id, planId: plan.id, status: "active" });
  return { companyId: company.id, plan };
}

describe("listPlans", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("orders plans by monthly price, cheapest first", async () => {
    await seedPlan({ name: "Z-Expensive", monthlyPriceUsd: 999 });
    await seedPlan({ name: "A-Cheap", monthlyPriceUsd: 10 });
    await seedPlan({ name: "M-Mid", monthlyPriceUsd: 100 });

    const plans = await listPlans();
    const names = plans.map((p) => p.name);
    expect(names.indexOf("A-Cheap")).toBeLessThan(names.indexOf("M-Mid"));
    expect(names.indexOf("M-Mid")).toBeLessThan(names.indexOf("Z-Expensive"));
  });
});

describe("validatePlanChange", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("passes when current usage fits inside the target plan's limits (an upgrade always passes)", async () => {
    const { companyId } = await seedCompanyOnPlan({ maxSeats: 1, maxDatasets: 1 });
    const biggerPlan = await seedPlan({ maxSeats: 10, maxDatasets: 10 });

    const result = await validatePlanChange(companyId, biggerPlan);
    expect(result).toEqual({ ok: true });
  });

  it("blocks a downgrade when seats in use exceed the target plan's seat limit", async () => {
    const { companyId } = await seedCompanyOnPlan();
    await db().insert(schema.users).values([
      { companyId, email: `seat-a-${crypto.randomUUID()}@example.com` },
      { companyId, email: `seat-b-${crypto.randomUUID()}@example.com` },
      { companyId, email: `seat-c-${crypto.randomUUID()}@example.com` },
    ]);
    const smallerPlan = await seedPlan({ maxSeats: 2 });

    const result = await validatePlanChange(companyId, smallerPlan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.join(" ")).toContain("seats in use");
    }
  });

  it("never blocks on seats when the target plan has an unlimited (null) seat cap", async () => {
    const { companyId } = await seedCompanyOnPlan();
    for (let i = 0; i < 20; i += 1) {
      await db().insert(schema.users).values({ companyId, email: `many-${crypto.randomUUID()}@example.com` });
    }
    const unlimitedSeatsPlan = await seedPlan({ maxSeats: null });

    const result = await validatePlanChange(companyId, unlimitedSeatsPlan);
    expect(result.ok).toBe(true);
  });

  it("blocks a downgrade when active datasets exceed the target plan's dataset limit", async () => {
    const { companyId } = await seedCompanyOnPlan();
    const [source] = await db()
      .insert(schema.sources)
      .values({ companyId, kind: "manual", name: `plan-test-source-${crypto.randomUUID()}` })
      .returning();
    await db().insert(schema.datasets).values([
      { companyId, sourceId: source.id, externalId: "plan-ds-1" },
      { companyId, sourceId: source.id, externalId: "plan-ds-2" },
    ]);
    const smallerPlan = await seedPlan({ maxDatasets: 1 });

    const result = await validatePlanChange(companyId, smallerPlan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.join(" ")).toContain("datasets in use");
  });

  it("blocks a downgrade when stored data exceeds the target plan's storage limit", async () => {
    const { companyId } = await seedCompanyOnPlan();
    await db().insert(schema.usageCounters).values({
      companyId,
      metric: "storage_kb",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      value: 5_000,
    });
    const smallerPlan = await seedPlan({ maxStorageKb: 1_000 });

    const result = await validatePlanChange(companyId, smallerPlan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.join(" ")).toContain("stored");
  });

  it("does NOT block on monthly flow metrics (leads/raw-records/Apify requests) even when already over the target's budget", async () => {
    const { companyId } = await seedCompanyOnPlan();
    for (let i = 0; i < 50; i += 1) await incrementMonthlyLeadUsage(companyId);
    await incrementRawRecordUsage(companyId, 5_000);
    for (let i = 0; i < 50; i += 1) await incrementApifyRequestUsage(companyId);

    // A much smaller plan on every monthly metric, but with stock limits
    // (seats/datasets/alertRules/storage) generously above current usage.
    const restrictivePlan = await seedPlan({
      maxLeadsPerMonth: 1,
      maxRawRecordsPerMonth: 1,
      maxApifyRequestsPerMonth: 1,
      maxSeats: 100,
      maxDatasets: 100,
      maxAlertRules: 100,
      maxStorageKb: 1_000_000,
    });

    const result = await validatePlanChange(companyId, restrictivePlan);
    expect(result).toEqual({ ok: true });
  });

  it("reports every violated metric at once, not just the first", async () => {
    const { companyId } = await seedCompanyOnPlan();
    await db().insert(schema.users).values([
      { companyId, email: `multi-a-${crypto.randomUUID()}@example.com` },
      { companyId, email: `multi-b-${crypto.randomUUID()}@example.com` },
    ]);
    const [source] = await db()
      .insert(schema.sources)
      .values({ companyId, kind: "manual", name: `plan-test-source-${crypto.randomUUID()}` })
      .returning();
    await db().insert(schema.datasets).values([
      { companyId, sourceId: source.id, externalId: "multi-ds-1" },
      { companyId, sourceId: source.id, externalId: "multi-ds-2" },
    ]);
    const tinyPlan = await seedPlan({ maxSeats: 1, maxDatasets: 1 });

    const result = await validatePlanChange(companyId, tinyPlan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(2);
    }
  });
});
