import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { getSourcePerformance } from "./source-performance";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Source Perf Test Co ${crypto.randomUUID()}`, slug: `source-perf-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedSourceAndDataset(companyId: string, sourceName: string) {
  const [source] = await db().insert(schema.sources).values({ companyId, kind: "manual", name: sourceName }).returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ companyId, sourceId: source.id, externalId: `ds-${crypto.randomUUID()}` })
    .returning();
  return { sourceId: source.id, datasetId: dataset.id };
}

async function seedLead(companyId: string, overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [lead] = await db().insert(schema.leads).values({ companyId, ...overrides }).returning();
  return lead;
}

async function seedAppearance(companyId: string, datasetId: string, leadId: string) {
  const externalId = `item-${crypto.randomUUID()}`;
  const [rawRecord] = await db()
    .insert(schema.rawRecords)
    .values({
      companyId,
      datasetId,
      sourceItemId: externalId,
      payload: { id: externalId },
      contentHash: `hash:${externalId}`,
      payloadHash: `payload-hash:${externalId}`,
    })
    .returning();

  await db()
    .insert(schema.leadAppearances)
    .values({ companyId, leadId, rawRecordId: rawRecord.id, datasetId, externalId, postedAt: new Date() });
}

describe("getSourcePerformance", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("computes per-source counts, average score, and revenue — crediting a multi-source lead to every source it appeared in", async () => {
    const companyId = await seedCompany();
    const sourceA = await seedSourceAndDataset(companyId, "Facebook Groups");
    const sourceB = await seedSourceAndDataset(companyId, "Instagram");

    const lead1 = await seedLead(companyId, { leadType: "buyer", buyerScore: 80 });
    await db().insert(schema.leadStates).values({
      leadId: lead1.id,
      companyId,
      status: "closed",
      firstContactedAt: new Date(),
      dealValueUsd: 10_000,
    });
    await seedAppearance(companyId, sourceA.datasetId, lead1.id);

    const lead2 = await seedLead(companyId, { leadType: "seller", buyerScore: 20 });
    await seedAppearance(companyId, sourceA.datasetId, lead2.id);

    // Appears in BOTH sources — must be credited to both, not split between them.
    const lead3 = await seedLead(companyId, { leadType: "buyer", buyerScore: 60 });
    await db().insert(schema.leadStates).values({ leadId: lead3.id, companyId, status: "qualified" });
    await seedAppearance(companyId, sourceA.datasetId, lead3.id);
    await seedAppearance(companyId, sourceB.datasetId, lead3.id);

    const results = await getSourcePerformance(companyId);
    const byName = Object.fromEntries(results.map((r) => [r.sourceName, r]));

    expect(byName["Facebook Groups"].leadCount).toBe(3); // lead1, lead2, lead3
    expect(byName["Facebook Groups"].buyerCount).toBe(2); // lead1, lead3
    expect(byName["Facebook Groups"].avgBuyerScore).toBe(Math.round((80 + 20 + 60) / 3));
    expect(byName["Facebook Groups"].contactedCount).toBe(1); // lead1
    expect(byName["Facebook Groups"].closedCount).toBe(1); // lead1
    expect(byName["Facebook Groups"].closedRevenueUsd).toBe(10_000);
    expect(byName["Facebook Groups"].conversionPct).toBeCloseTo((1 / 3) * 100, 5);

    expect(byName.Instagram.leadCount).toBe(1); // lead3 only
    expect(byName.Instagram.buyerCount).toBe(1);
    expect(byName.Instagram.closedCount).toBe(0);
    expect(byName.Instagram.closedRevenueUsd).toBe(0);
  });

  it("returns an empty list for a company with no appearances", async () => {
    const companyId = await seedCompany();
    expect(await getSourcePerformance(companyId)).toEqual([]);
  });
});
