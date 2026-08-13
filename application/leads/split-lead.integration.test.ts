import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { processRawRecords } from "./process-records";
import { splitAppearanceIntoNewLead, SplitLeadError } from "./split-lead";
import { resetDb } from "@/test/integration/db-helpers";
import type { MappingRules } from "@/domain/dataset/types";

const rulesWithIdentity: MappingRules = {
  externalId: { from: ["id"] },
  body: { from: ["text"] },
  postedAt: { from: ["time"], transform: "toIso8601" },
  authorExternalId: { from: ["authorId"] },
  authorName: { from: ["authorName"] },
};

async function seedDataset() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Split Lead Test Co ${crypto.randomUUID()}`, slug: `split-lead-${crypto.randomUUID()}` })
    .returning();
  const [source] = await db()
    .insert(schema.sources)
    .values({ companyId: company.id, kind: "manual", name: `test-source-${crypto.randomUUID()}` })
    .returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ companyId: company.id, sourceId: source.id, externalId: "ds-1" })
    .returning();
  return { companyId: company.id, datasetId: dataset.id };
}

async function seedRawRecord(companyId: string, datasetId: string, payload: Record<string, unknown>) {
  const [record] = await db()
    .insert(schema.rawRecords)
    .values({
      companyId,
      datasetId,
      sourceItemId: String(payload.id),
      payload,
      contentHash: `hash:${payload.id}`,
      payloadHash: `payload-hash:${payload.id}`,
    })
    .returning();
  return record;
}

describe("splitAppearanceIntoNewLead", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("splits the merged-in appearance into its own lead, without carrying the shared identity key forward", async () => {
    const { companyId, datasetId } = await seedDataset();
    const first = await seedRawRecord(companyId, datasetId, {
      id: "post-a",
      authorId: "fb-splittable",
      authorName: "Jane Doe",
      text: "Looking to buy a villa in Canggu",
      time: "2026-01-01T00:00:00.000Z",
    });
    const second = await seedRawRecord(companyId, datasetId, {
      id: "post-b",
      authorId: "fb-splittable",
      authorName: "Jane Doe",
      text: "Still looking, budget $350k",
      time: "2026-01-05T00:00:00.000Z",
    });

    await processRawRecords([first], rulesWithIdentity, { companyId, passthrough: true, datasetId });
    await processRawRecords([second], rulesWithIdentity, { companyId, passthrough: true, datasetId });

    const [oldLead] = await db().select().from(schema.leads).where(eq(schema.leads.facebookId, "fb-splittable"));
    expect(oldLead.appearanceCount).toBe(2);

    const [mergedEvent] = await db()
      .select()
      .from(schema.leadEvents)
      .where(and(eq(schema.leadEvents.leadId, oldLead.id), eq(schema.leadEvents.type, "merged")));
    expect(mergedEvent).toBeDefined();
    const appearanceId = mergedEvent.payload?.appearanceId as string;
    expect(appearanceId).toBeTruthy();

    const [actor] = await db()
      .insert(schema.users)
      .values({ companyId, email: `split-actor-${crypto.randomUUID()}@example.com`, role: "owner", passwordHash: "x" })
      .returning();

    const { newLeadId, oldLeadId } = await splitAppearanceIntoNewLead(companyId, appearanceId, actor.id);
    expect(oldLeadId).toBe(oldLead.id);

    const [refreshedOld] = await db().select().from(schema.leads).where(eq(schema.leads.id, oldLeadId));
    const [newLead] = await db().select().from(schema.leads).where(eq(schema.leads.id, newLeadId));

    // The identity key stays put — creating a second lead with the same
    // facebookId would violate the unique index, and correctly so.
    expect(refreshedOld.facebookId).toBe("fb-splittable");
    expect(refreshedOld.appearanceCount).toBe(1);
    expect(newLead.facebookId).toBeNull();
    expect(newLead.name).toBe("Jane Doe");
    expect(newLead.appearanceCount).toBe(1);

    const movedAppearance = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.id, appearanceId));
    expect(movedAppearance[0].leadId).toBe(newLeadId);

    const splitEvents = await db().select().from(schema.leadEvents).where(eq(schema.leadEvents.type, "split"));
    expect(splitEvents).toHaveLength(2);
    expect(splitEvents.map((e) => e.leadId).sort()).toEqual([oldLeadId, newLeadId].sort());
  });

  it("refuses to split a person's only appearance", async () => {
    const { companyId, datasetId } = await seedDataset();
    const record = await seedRawRecord(companyId, datasetId, {
      id: "post-solo",
      authorId: "fb-solo",
      authorName: "Solo Person",
      text: "Looking to buy",
      time: "2026-01-01T00:00:00.000Z",
    });
    await processRawRecords([record], rulesWithIdentity, { companyId, passthrough: true, datasetId });

    const [appearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, record.id));

    await expect(splitAppearanceIntoNewLead(companyId, appearance.id, crypto.randomUUID())).rejects.toThrow(SplitLeadError);
  });

  it("refuses to split an appearance flagged as a duplicate of another (canonicalAppearanceId set)", async () => {
    const { companyId, datasetId } = await seedDataset();
    const first = await seedRawRecord(companyId, datasetId, {
      id: "post-dup-a",
      authorId: "fb-dup",
      authorName: "Dup Person",
      text: "Looking to buy a villa in Canggu with a real budget of $400k please contact me",
      time: "2026-01-01T00:00:00.000Z",
    });
    const second = await seedRawRecord(companyId, datasetId, {
      id: "post-dup-b",
      authorId: "fb-dup",
      authorName: "Dup Person",
      text: "Looking to buy a villa in Canggu with a real budget of $400k please contact me",
      time: "2026-01-01T00:05:00.000Z",
    });
    await processRawRecords([first], rulesWithIdentity, { companyId, passthrough: true, datasetId });
    await processRawRecords([second], rulesWithIdentity, { companyId, passthrough: true, datasetId });

    const duplicate = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.companyId, companyId));
    const canonicalPointer = duplicate.find((a) => a.canonicalAppearanceId !== null);
    expect(canonicalPointer).toBeDefined();

    await expect(
      splitAppearanceIntoNewLead(companyId, canonicalPointer!.id, crypto.randomUUID()),
    ).rejects.toThrow(SplitLeadError);
  });
});
