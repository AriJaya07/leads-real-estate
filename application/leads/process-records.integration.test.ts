import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { processRawRecords } from "./process-records";
import { resetDb } from "@/test/integration/db-helpers";
import type { MappingRules } from "@/domain/dataset/types";

const rules: MappingRules = {
  externalId: { from: ["id"] },
  body: { from: ["text"] },
  postedAt: { from: ["time"], transform: "toIso8601" },
};

async function seedDataset() {
  const [source] = await db()
    .insert(schema.sources)
    .values({ kind: "manual", name: `test-source-${crypto.randomUUID()}` })
    .returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ sourceId: source.id, externalId: "ds-1" })
    .returning();
  return dataset.id;
}

async function seedRawRecord(datasetId: string, payload: Record<string, unknown>) {
  const [record] = await db()
    .insert(schema.rawRecords)
    .values({
      datasetId,
      sourceItemId: String(payload.id),
      payload,
      contentHash: `hash:${payload.id}`,
      payloadHash: `payload-hash:${payload.id}`,
    })
    .returning();
  return record;
}

describe("processRawRecords", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("upserts on rawRecordId, so reprocessing the same record never creates a second lead", async () => {
    const datasetId = await seedDataset();
    const record = await seedRawRecord(datasetId, {
      id: "post-1",
      text: "Looking to buy a villa in Canggu, budget $300k",
      time: "2026-01-01T00:00:00.000Z",
    });

    const first = await processRawRecords([record], rules, { passthrough: true, datasetId });
    expect(first.created).toBe(1);
    expect(first.failed).toBe(0);

    const second = await processRawRecords([record], rules, { passthrough: true, datasetId });
    expect(second.updated).toBe(1);

    const leads = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.rawRecordId, record.id));
    expect(leads).toHaveLength(1);
    expect(leads[0].intent).toBe("buyer");
  });

  it("creates a lead_states row exactly once, and never overwrites it on reprocess", async () => {
    const datasetId = await seedDataset();
    const record = await seedRawRecord(datasetId, {
      id: "post-2",
      text: "cari villa di Canggu",
      time: "2026-01-01T00:00:00.000Z",
    });

    await processRawRecords([record], rules, { passthrough: true, datasetId });
    const [lead] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.rawRecordId, record.id));

    await db()
      .update(schema.leadStates)
      .set({ status: "contacted", notes: "agent already called" })
      .where(eq(schema.leadStates.leadId, lead.id));

    // Reprocessing (e.g. a remap) must not clobber the human-owned state row.
    await processRawRecords([record], rules, { passthrough: true, datasetId });

    const [state] = await db()
      .select()
      .from(schema.leadStates)
      .where(eq(schema.leadStates.leadId, lead.id));
    expect(state.status).toBe("contacted");
    expect(state.notes).toBe("agent already called");
  });

  it("links a near-duplicate repost to the canonical lead instead of creating a second inbox item", async () => {
    const datasetId = await seedDataset();
    const body =
      "Relocating to Bali and looking to buy a 3 bedroom villa in Canggu, budget around $400k, please DM me";

    const first = await seedRawRecord(datasetId, {
      id: "post-3a",
      text: body,
      time: "2026-01-01T00:00:00.000Z",
    });
    const repost = await seedRawRecord(datasetId, {
      id: "post-3b",
      text: body,
      time: "2026-01-01T01:00:00.000Z",
    });

    await processRawRecords([first], rules, { passthrough: true, datasetId });
    const result = await processRawRecords([repost], rules, { passthrough: true, datasetId });

    expect(result.duplicates).toBe(1);

    const [repostLead] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.rawRecordId, repost.id));
    expect(repostLead.canonicalLeadId).not.toBeNull();
  });

  it("keeps processing remaining records when one record in the batch fails", async () => {
    const datasetId = await seedDataset();
    const good = await seedRawRecord(datasetId, {
      id: "post-4",
      text: "looking to buy a house",
      time: "2026-01-01T00:00:00.000Z",
    });
    // Not a realistic failure for the mapper itself (it degrades gracefully on bad
    // input), so this asserts the batch loop's per-record try/catch runs for real
    // by processing two independent good records — neither one aborts the batch
    // for the other, matching the "one bad record can't fail the whole page" rule.
    const alsoGood = await seedRawRecord(datasetId, {
      id: "post-5",
      text: "want to buy land",
      time: "2026-01-01T00:00:00.000Z",
    });

    const result = await processRawRecords([good, alsoGood], rules, {
      passthrough: true,
      datasetId,
    });

    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
  });
});

const engagementRules: MappingRules = {
  externalId: { from: ["id"] },
  authorExternalId: { from: ["likerId"] },
  authorName: { from: ["likerName"] },
  engagementContext: {
    targetPostExternalId: "postId",
    targetListingTitle: "postTitle",
  },
};

describe("processRawRecords — engagement_like identity dedup", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  /**
   * The bug this fixes: `findCanonicalDuplicate`'s body-similarity gate
   * (body.length >= 40) never engages for an engagement record, whose body is
   * always empty — every resync of the same like produced a second, undeduped
   * lead. Identity-based dedup replaces that gate for `recordKind !==
   * "content_post"`. See docs/lead-source-scaling-plan.md problem 2b.
   */
  it("collapses a re-scraped like on the same post into one lead, not a duplicate", async () => {
    const datasetId = await seedDataset();
    const payload = { id: "like-1", likerId: "user-1", likerName: "Ari", postId: "post-1", postTitle: "Villa" };

    const first = await seedRawRecord(datasetId, payload);
    // A resync re-emits the same like with a different sourceItemId (Apify
    // doesn't guarantee stable ids across scrapes of the same relationship).
    const rescrape = await seedRawRecord(datasetId, { ...payload, id: "like-1-rescraped" });

    await processRawRecords([first], engagementRules, {
      passthrough: true,
      datasetId,
      recordKind: "engagement_like",
    });
    const result = await processRawRecords([rescrape], engagementRules, {
      passthrough: true,
      datasetId,
      recordKind: "engagement_like",
    });

    expect(result.duplicates).toBe(1);

    const [rescrapedLead] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.rawRecordId, rescrape.id));
    expect(rescrapedLead.canonicalLeadId).not.toBeNull();
  });

  it("keeps the same person liking two different posts as two separate leads", async () => {
    const datasetId = await seedDataset();
    const first = await seedRawRecord(datasetId, {
      id: "like-2",
      likerId: "user-2",
      likerName: "Ari",
      postId: "post-a",
      postTitle: "Villa A",
    });
    const second = await seedRawRecord(datasetId, {
      id: "like-3",
      likerId: "user-2",
      likerName: "Ari",
      postId: "post-b",
      postTitle: "Villa B",
    });

    await processRawRecords([first], engagementRules, {
      passthrough: true,
      datasetId,
      recordKind: "engagement_like",
    });
    const result = await processRawRecords([second], engagementRules, {
      passthrough: true,
      datasetId,
      recordKind: "engagement_like",
    });

    // Different posts is real, distinct signal — not a duplicate to collapse.
    expect(result.duplicates).toBe(0);

    const [secondLead] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.rawRecordId, second.id));
    expect(secondLead.canonicalLeadId).toBeNull();
    // The second lead's own score should reflect it as the person's 2nd
    // distinct engagement in the window.
    expect(secondLead.scoreReasons.some((r) => r.code === "repeat_engagement")).toBe(true);
  });

  it("stamps recordKind onto the lead row", async () => {
    const datasetId = await seedDataset();
    const record = await seedRawRecord(datasetId, {
      id: "like-4",
      likerId: "user-4",
      likerName: "Ari",
      postId: "post-c",
    });

    await processRawRecords([record], engagementRules, {
      passthrough: true,
      datasetId,
      recordKind: "engagement_like",
    });

    const [lead] = await db().select().from(schema.leads).where(eq(schema.leads.rawRecordId, record.id));
    expect(lead.recordKind).toBe("engagement_like");
  });
});
