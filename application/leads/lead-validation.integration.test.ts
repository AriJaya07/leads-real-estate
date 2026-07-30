import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { getLeadValidation } from "./lead-validation";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompanySourceDataset() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Lead Validation Test Co ${crypto.randomUUID()}`, slug: `lead-validation-${crypto.randomUUID()}` })
    .returning();
  const [source] = await db()
    .insert(schema.sources)
    .values({ companyId: company.id, kind: "manual", name: `lead-validation-source-${crypto.randomUUID()}` })
    .returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ companyId: company.id, sourceId: source.id, externalId: `lead-validation-ds-${crypto.randomUUID()}` })
    .returning();
  return { companyId: company.id, datasetId: dataset.id };
}

async function seedAppearance(
  companyId: string,
  datasetId: string,
  leadId: string,
  overrides: Partial<typeof schema.leadAppearances.$inferInsert> = {},
) {
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
    .values({
      companyId,
      leadId,
      rawRecordId: rawRecord.id,
      datasetId,
      externalId,
      postedAt: new Date(),
      ...overrides,
    });
}

describe("getLeadValidation", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("rates a complete, engaged, on-market buyer with an industry-relevant affiliation as high potential", async () => {
    const { companyId, datasetId } = await seedCompanySourceDataset();

    const [lead] = await db()
      .insert(schema.leads)
      .values({
        companyId,
        name: "Made Wirawan",
        avatarUrl: "https://example.com/a.jpg",
        bio: "Looking for a villa",
        username: "madew",
        profileUrl: "https://instagram.com/madew",
        location: "Canggu, Bali",
        propertyTypes: ["villa"],
        locations: ["canggu"],
        budgetUsdMin: 200_000,
        budgetUsdMax: 300_000,
        leadType: "buyer",
        contact: { phone: "+6281234567890", whatsapp: "+6281234567890", email: "made@example.com" },
        buyerScore: 90,
        confidenceScore: 85,
        appearanceCount: 2,
        latestAppearanceAt: new Date(),
      })
      .returning();

    await seedAppearance(companyId, datasetId, lead.id, { likes: 50, comments: 10, shares: 3 });
    await seedAppearance(companyId, datasetId, lead.id, { likes: 20, comments: 5, shares: 1 });
    // Spam and duplicate appearances must not inflate the engagement score.
    await seedAppearance(companyId, datasetId, lead.id, { likes: 999, isSpam: true });

    const [targetCompany] = await db()
      .insert(schema.targetCompanies)
      .values({ companyId, name: "Bali Realty Group", industry: "Real Estate Development" })
      .returning();
    await db()
      .insert(schema.leadTargetCompanyAffiliations)
      .values({ leadId: lead.id, targetCompanyId: targetCompany.id, role: "agent" });

    const result = await getLeadValidation(companyId, lead.id);

    expect(result).not.toBeNull();
    expect(result!.validationResult).toBe("high_potential");
    expect(result!.breakdown.industry).toBeGreaterThan(50);
    expect(result!.breakdown.location).toBe(100);
    expect(result!.breakdown.contactInfo).toBe(100);
    expect(result!.breakdown.engagement).toBeGreaterThan(0);
  });

  it("rates a near-empty record as low potential", async () => {
    const { companyId } = await seedCompanySourceDataset();
    const [lead] = await db().insert(schema.leads).values({ companyId }).returning();

    const result = await getLeadValidation(companyId, lead.id);

    expect(result).not.toBeNull();
    expect(result!.validationResult).toBe("low_potential");
    expect(result!.breakdown.completeness).toBe(0);
    expect(result!.breakdown.engagement).toBe(0);
  });

  it("scopes lookups to the requesting company", async () => {
    const { companyId } = await seedCompanySourceDataset();
    const { companyId: otherCompanyId } = await seedCompanySourceDataset();
    const [lead] = await db().insert(schema.leads).values({ companyId }).returning();

    expect(await getLeadValidation(otherCompanyId, lead.id)).toBeNull();
  });

  it("returns null for a lead that doesn't exist", async () => {
    const { companyId } = await seedCompanySourceDataset();
    expect(await getLeadValidation(companyId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
