import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { DEFAULT_FILTERS } from "./filters.schema";
import { queryLeads } from "./lead-queries";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Lead Queries Test Co ${crypto.randomUUID()}`, slug: `lead-queries-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedSourceAndDataset(companyId: string, sourceName: string) {
  const [source] = await db()
    .insert(schema.sources)
    .values({ companyId, kind: "manual", name: sourceName })
    .returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ companyId, sourceId: source.id, externalId: `ds-${crypto.randomUUID()}` })
    .returning();
  return { sourceId: source.id, datasetId: dataset.id };
}

async function seedLead(companyId: string, overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [lead] = await db()
    .insert(schema.leads)
    .values({ companyId, ...overrides })
    .returning();
  await db().insert(schema.leadStates).values({ leadId: lead.id, companyId });
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

describe("queryLeads — data quality, lead score, source and date-collected filters", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("filters by minLeadScore", async () => {
    const companyId = await seedCompany();
    const high = await seedLead(companyId, { name: "High Scorer", leadScore: 90 });
    await seedLead(companyId, { name: "Low Scorer", leadScore: 10 });

    const page = await queryLeads(companyId, { ...DEFAULT_FILTERS, minLeadScore: 50 });

    expect(page.items.map((l) => l.id)).toEqual([high.id]);
  });

  it("filters by dataQuality tier", async () => {
    const companyId = await seedCompany();
    const hot = await seedLead(companyId, { name: "Hot", dataQualityTier: "high_potential" });
    await seedLead(companyId, { name: "Cold", dataQualityTier: "low_potential" });

    const page = await queryLeads(companyId, { ...DEFAULT_FILTERS, dataQuality: ["high_potential"] });

    expect(page.items.map((l) => l.id)).toEqual([hot.id]);
  });

  it("drops an invalid dataQuality value instead of erroring", async () => {
    const companyId = await seedCompany();
    await seedLead(companyId, { name: "Whoever" });

    const page = await queryLeads(companyId, { ...DEFAULT_FILTERS, dataQuality: ["not-a-real-tier"] });

    // Invalid values are dropped, leaving the filter effectively unset — every lead matches.
    expect(page.items).toHaveLength(1);
  });

  it("filters by sourceIds via the lead's appearances", async () => {
    const companyId = await seedCompany();
    const { sourceId: sourceA, datasetId: datasetA } = await seedSourceAndDataset(companyId, "Source A");
    const { datasetId: datasetB } = await seedSourceAndDataset(companyId, "Source B");

    const leadA = await seedLead(companyId, { name: "From A" });
    await seedAppearance(companyId, datasetA, leadA.id);
    const leadB = await seedLead(companyId, { name: "From B" });
    await seedAppearance(companyId, datasetB, leadB.id);

    const page = await queryLeads(companyId, { ...DEFAULT_FILTERS, sourceIds: [sourceA] });

    expect(page.items.map((l) => l.id)).toEqual([leadA.id]);
  });

  it("filters by collectedAfter/collectedBefore on the lead's own createdAt, not last-active", async () => {
    const companyId = await seedCompany();
    await seedLead(companyId, { name: "Older", createdAt: new Date("2025-01-01T00:00:00.000Z") });
    const recent = await seedLead(companyId, { name: "Recent", createdAt: new Date("2026-06-01T00:00:00.000Z") });

    const page = await queryLeads(companyId, { ...DEFAULT_FILTERS, collectedAfter: "2026-01-01" });

    expect(page.items.map((l) => l.id)).toEqual([recent.id]);
  });

  it("extends free-text search to match company, location and category (property type)", async () => {
    const companyId = await seedCompany();
    const byLocation = await seedLead(companyId, { name: "Loc Match", locations: ["canggu"] });
    const byCategory = await seedLead(companyId, { name: "Cat Match", propertyTypes: ["villa"] });
    const unrelated = await seedLead(companyId, { name: "Nomatch" });
    void unrelated;

    const [target] = await db()
      .insert(schema.targetCompanies)
      .values({ companyId, name: "Acme Realty" })
      .returning();
    const byCompany = await seedLead(companyId, { name: "Company Match" });
    await db()
      .insert(schema.leadTargetCompanyAffiliations)
      .values({ leadId: byCompany.id, targetCompanyId: target.id });

    const locationPage = await queryLeads(companyId, { ...DEFAULT_FILTERS, q: "canggu" });
    expect(locationPage.items.map((l) => l.id)).toEqual([byLocation.id]);

    const categoryPage = await queryLeads(companyId, { ...DEFAULT_FILTERS, q: "villa" });
    expect(categoryPage.items.map((l) => l.id)).toEqual([byCategory.id]);

    const companyPage = await queryLeads(companyId, { ...DEFAULT_FILTERS, q: "Acme" });
    expect(companyPage.items.map((l) => l.id)).toEqual([byCompany.id]);
  });
});
