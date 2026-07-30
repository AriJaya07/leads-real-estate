import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import {
  assertWithinLimit,
  currentMonthBounds,
  getUsageSummary,
  incrementApifyRequestUsage,
  incrementMonthlyLeadUsage,
  incrementRawRecordUsage,
  incrementStorageUsage,
  isWithinMonthlyBudget,
  LimitExceededError,
} from "./usage";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompanyWithPlan(overrides: Partial<typeof schema.plans.$inferInsert> = {}) {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Usage Test Co ${crypto.randomUUID()}`, slug: `usage-test-${crypto.randomUUID()}` })
    .returning();
  const [plan] = await db()
    .insert(schema.plans)
    .values({
      name: `Usage Test Plan ${crypto.randomUUID()}`,
      maxSeats: 2,
      maxDatasets: 2,
      maxRawRecordsPerMonth: 1000,
      maxLeadsPerMonth: 100,
      maxAlertRules: 10,
      maxApifyRequestsPerMonth: 1000,
      maxStorageKb: 1_000_000,
      dataRetentionDays: 365,
      ...overrides,
    })
    .returning();
  await db().insert(schema.subscriptions).values({ companyId: company.id, planId: plan.id, status: "active" });
  return company.id;
}

describe("assertWithinLimit — seats", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("allows adding a user while under the seat limit", async () => {
    const companyId = await seedCompanyWithPlan({ maxSeats: 2 });
    await db().insert(schema.users).values({ companyId, email: `seat-1-${crypto.randomUUID()}@example.com` });

    await expect(assertWithinLimit(companyId, "seats")).resolves.toBeUndefined();
  });

  it("throws LimitExceededError once the seat limit is reached", async () => {
    const companyId = await seedCompanyWithPlan({ maxSeats: 1 });
    await db().insert(schema.users).values({ companyId, email: `seat-2-${crypto.randomUUID()}@example.com` });

    await expect(assertWithinLimit(companyId, "seats")).rejects.toThrow(LimitExceededError);
  });

  it("never counts another company's users toward this company's limit", async () => {
    const companyA = await seedCompanyWithPlan({ maxSeats: 1 });
    const companyB = await seedCompanyWithPlan({ maxSeats: 1 });
    await db().insert(schema.users).values({ companyId: companyB, email: `seat-3-${crypto.randomUUID()}@example.com` });

    // Company A has zero users of its own — company B being at its own limit
    // must not affect company A's check.
    await expect(assertWithinLimit(companyA, "seats")).resolves.toBeUndefined();
  });
});

describe("assertWithinLimit — datasets", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("throws once active (non-archived) datasets reach the limit", async () => {
    const companyId = await seedCompanyWithPlan({ maxDatasets: 1 });
    const [source] = await db()
      .insert(schema.sources)
      .values({ companyId, kind: "manual", name: `usage-test-source-${crypto.randomUUID()}` })
      .returning();
    await db().insert(schema.datasets).values({ companyId, sourceId: source.id, externalId: "usage-ds-1" });

    await expect(assertWithinLimit(companyId, "datasets")).rejects.toThrow(LimitExceededError);
  });

  it("archived datasets don't count against the limit", async () => {
    const companyId = await seedCompanyWithPlan({ maxDatasets: 1 });
    const [source] = await db()
      .insert(schema.sources)
      .values({ companyId, kind: "manual", name: `usage-test-source-${crypto.randomUUID()}` })
      .returning();
    await db()
      .insert(schema.datasets)
      .values({ companyId, sourceId: source.id, externalId: "usage-ds-2", status: "archived" });

    await expect(assertWithinLimit(companyId, "datasets")).resolves.toBeUndefined();
  });
});

describe("incrementMonthlyLeadUsage / getUsageSummary", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("increments the current month's counter across repeated calls", async () => {
    const companyId = await seedCompanyWithPlan();

    await incrementMonthlyLeadUsage(companyId);
    await incrementMonthlyLeadUsage(companyId);
    await incrementMonthlyLeadUsage(companyId);

    const summary = await getUsageSummary(companyId);
    expect(summary?.leadsThisMonth.used).toBe(3);
  });

  it("keeps two companies' monthly counters independent", async () => {
    const companyA = await seedCompanyWithPlan();
    const companyB = await seedCompanyWithPlan();

    await incrementMonthlyLeadUsage(companyA);
    await incrementMonthlyLeadUsage(companyA);
    await incrementMonthlyLeadUsage(companyB);

    const [summaryA, summaryB] = await Promise.all([getUsageSummary(companyA), getUsageSummary(companyB)]);
    expect(summaryA?.leadsThisMonth.used).toBe(2);
    expect(summaryB?.leadsThisMonth.used).toBe(1);
  });

  it("getUsageSummary reflects seats/datasets/leads together, scoped to one company", async () => {
    const companyId = await seedCompanyWithPlan({
      maxSeats: 5,
      maxDatasets: 5,
      maxLeadsPerMonth: 50,
      maxRawRecordsPerMonth: 500,
      maxApifyRequestsPerMonth: 200,
      maxStorageKb: 10_000,
      maxAlertRules: 20,
    });
    await db().insert(schema.users).values({ companyId, email: `summary-${crypto.randomUUID()}@example.com` });
    await incrementMonthlyLeadUsage(companyId);

    const summary = await getUsageSummary(companyId);
    expect(summary).toEqual({
      datasets: { used: 0, limit: 5 },
      seats: { used: 1, limit: 5 },
      leadsThisMonth: { used: 1, limit: 50 },
      rawRecordsThisMonth: { used: 0, limit: 500 },
      apifyRequestsThisMonth: { used: 0, limit: 200 },
      storageKb: { used: 0, limit: 10_000 },
      alertRules: { used: 0, limit: 20 },
    });
  });

  it("seats/alertRules limit shows as null (unlimited) when the plan has no cap", async () => {
    const companyId = await seedCompanyWithPlan({ maxSeats: null, maxAlertRules: null });

    const summary = await getUsageSummary(companyId);
    expect(summary?.seats.limit).toBeNull();
    expect(summary?.alertRules.limit).toBeNull();
  });
});

describe("assertWithinLimit — unlimited seats", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("never throws when the plan's seat limit is null", async () => {
    const companyId = await seedCompanyWithPlan({ maxSeats: null });
    for (let i = 0; i < 5; i += 1) {
      await db().insert(schema.users).values({ companyId, email: `unlimited-${crypto.randomUUID()}@example.com` });
    }

    await expect(assertWithinLimit(companyId, "seats")).resolves.toBeUndefined();
  });
});

describe("incrementRawRecordUsage / incrementApifyRequestUsage / isWithinMonthlyBudget", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("accumulates raw-record and apify-request counters independently, scoped per company", async () => {
    const companyId = await seedCompanyWithPlan();

    await incrementRawRecordUsage(companyId, 40);
    await incrementRawRecordUsage(companyId, 10);
    await incrementApifyRequestUsage(companyId);
    await incrementApifyRequestUsage(companyId);

    const summary = await getUsageSummary(companyId);
    expect(summary?.rawRecordsThisMonth.used).toBe(50);
    expect(summary?.apifyRequestsThisMonth.used).toBe(2);
  });

  it("a zero or negative record count is a no-op", async () => {
    const companyId = await seedCompanyWithPlan();
    await incrementRawRecordUsage(companyId, 0);
    await incrementRawRecordUsage(companyId, -5);

    const summary = await getUsageSummary(companyId);
    expect(summary?.rawRecordsThisMonth.used).toBe(0);
  });

  it("isWithinMonthlyBudget is true under the limit and false once it's reached", async () => {
    const companyId = await seedCompanyWithPlan({ maxApifyRequestsPerMonth: 3 });

    expect(await isWithinMonthlyBudget(companyId, "apifyRequests")).toBe(true);
    await incrementApifyRequestUsage(companyId);
    await incrementApifyRequestUsage(companyId);
    await incrementApifyRequestUsage(companyId);

    expect(await isWithinMonthlyBudget(companyId, "apifyRequests")).toBe(false);
  });

  it("isWithinMonthlyBudget never throws — returns true when there's no subscription row", async () => {
    const [company] = await db()
      .insert(schema.companies)
      .values({ name: `No Sub Co ${crypto.randomUUID()}`, slug: `no-sub-${crypto.randomUUID()}` })
      .returning();

    await expect(isWithinMonthlyBudget(company.id, "apifyRequests")).resolves.toBe(true);
  });
});

describe("incrementStorageUsage", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("converts bytes to KB (rounding up) and accumulates across calls", async () => {
    const companyId = await seedCompanyWithPlan();

    await incrementStorageUsage(companyId, 1024); // exactly 1 KB
    await incrementStorageUsage(companyId, 1500); // rounds up to 2 KB

    const summary = await getUsageSummary(companyId);
    expect(summary?.storageKb.used).toBe(3);
  });

  it("a zero or negative byte count is a no-op", async () => {
    const companyId = await seedCompanyWithPlan();
    await incrementStorageUsage(companyId, 0);

    const summary = await getUsageSummary(companyId);
    expect(summary?.storageKb.used).toBe(0);
  });

  it("sums across multiple months' worth of accumulated rows into one cumulative total", async () => {
    const companyId = await seedCompanyWithPlan();
    const { start: thisMonth } = currentMonthBounds();

    // Simulate a prior month's already-recorded usage directly, since
    // incrementStorageUsage always writes to the current month's row.
    await db().insert(schema.usageCounters).values({
      companyId,
      metric: "storage_kb",
      periodStart: "2020-01-01",
      periodEnd: "2020-01-31",
      value: 500,
    });
    await incrementStorageUsage(companyId, 1024 * 10); // 10 KB, lands in the current month

    const summary = await getUsageSummary(companyId);
    expect(summary?.storageKb.used).toBe(510);
    // Sanity: the seeded row really did land in a different period from "now."
    expect(thisMonth).not.toBe("2020-01-01");
  });
});
