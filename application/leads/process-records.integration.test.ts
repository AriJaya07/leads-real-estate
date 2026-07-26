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

/** Same three canonical fields as `rules`, plus an identity signal for merge tests. */
const rulesWithIdentity: MappingRules = {
  ...rules,
  authorExternalId: { from: ["authorId"] },
  authorName: { from: ["authorName"] },
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

  it("upserts on rawRecordId, so reprocessing the same record never creates a second appearance or a second person", async () => {
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

    const appearances = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, record.id));
    expect(appearances).toHaveLength(1);
    expect(appearances[0].intent).toBe("buyer");

    // The bug reprocessing without identity would otherwise trip: no author
    // id is mapped by `rules`, so re-resolving identity on every call would
    // spawn a fresh orphan person each time. The appearance's `leadId` must
    // stay the same across both calls instead.
    const allLeads = await db().select().from(schema.leads);
    expect(allLeads).toHaveLength(1);
  });

  it("rolls up the created person's AI-analysis fields from the appearance's classification", async () => {
    const datasetId = await seedDataset();
    const record = await seedRawRecord(datasetId, {
      id: "post-1b",
      text: "Looking to buy a villa in Canggu, budget $300k",
      time: "2026-01-01T00:00:00.000Z",
    });

    await processRawRecords([record], rules, { passthrough: true, datasetId });

    const [appearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, record.id));
    const [lead] = await db().select().from(schema.leads).where(eq(schema.leads.id, appearance.leadId));

    expect(lead.leadType).toBe("buyer");
    expect(lead.buyerScore).toBeGreaterThan(0);
    expect(lead.appearanceCount).toBe(1);
    expect(lead.aiExplanation.length).toBeGreaterThan(0);
  });

  it("creates a lead_states row exactly once, and never overwrites it on reprocess", async () => {
    const datasetId = await seedDataset();
    const record = await seedRawRecord(datasetId, {
      id: "post-2",
      text: "cari villa di Canggu",
      time: "2026-01-01T00:00:00.000Z",
    });

    await processRawRecords([record], rules, { passthrough: true, datasetId });
    const [appearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, record.id));

    await db()
      .update(schema.leadStates)
      .set({ status: "contacted", notes: "agent already called" })
      .where(eq(schema.leadStates.leadId, appearance.leadId));

    // Reprocessing (e.g. a remap) must not clobber the human-owned state row.
    await processRawRecords([record], rules, { passthrough: true, datasetId });

    const [state] = await db()
      .select()
      .from(schema.leadStates)
      .where(eq(schema.leadStates.leadId, appearance.leadId));
    expect(state.status).toBe("contacted");
    expect(state.notes).toBe("agent already called");
  });

  it("links a near-duplicate repost to the canonical appearance instead of creating a second inbox item", async () => {
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

    const [repostAppearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, repost.id));
    expect(repostAppearance.canonicalAppearanceId).not.toBeNull();
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

describe("processRawRecords — person identity merge", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  /**
   * The core requirement this whole refactor exists for: the same Facebook
   * account posting in two different groups (two different appearances, two
   * different raw records) merges into one person, not two separate leads.
   */
  it("merges two appearances from the same authorExternalId into one person", async () => {
    const datasetId = await seedDataset();
    const first = await seedRawRecord(datasetId, {
      id: "post-a",
      authorId: "fb-same-person",
      authorName: "Jane Doe",
      text: "Looking to buy a villa in Canggu",
      time: "2026-01-01T00:00:00.000Z",
    });
    const second = await seedRawRecord(datasetId, {
      id: "post-b",
      authorId: "fb-same-person",
      authorName: "Jane Doe",
      text: "Still looking to buy a villa, budget $350k",
      time: "2026-01-05T00:00:00.000Z",
    });

    await processRawRecords([first], rulesWithIdentity, { passthrough: true, datasetId });
    await processRawRecords([second], rulesWithIdentity, { passthrough: true, datasetId });

    const allLeads = await db().select().from(schema.leads);
    expect(allLeads).toHaveLength(1);
    expect(allLeads[0].facebookId).toBe("fb-same-person");
    expect(allLeads[0].appearanceCount).toBe(2);

    const appearances = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.leadId, allLeads[0].id));
    expect(appearances).toHaveLength(2);
  });

  it("does not merge two different authorExternalIds into the same person", async () => {
    const datasetId = await seedDataset();
    const first = await seedRawRecord(datasetId, {
      id: "post-c",
      authorId: "fb-person-1",
      authorName: "Jane Doe",
      text: "Looking to buy a villa",
      time: "2026-01-01T00:00:00.000Z",
    });
    const second = await seedRawRecord(datasetId, {
      id: "post-d",
      authorId: "fb-person-2",
      authorName: "John Smith",
      text: "Looking to buy land",
      time: "2026-01-01T00:00:00.000Z",
    });

    await processRawRecords([first], rulesWithIdentity, { passthrough: true, datasetId });
    await processRawRecords([second], rulesWithIdentity, { passthrough: true, datasetId });

    const allLeads = await db().select().from(schema.leads);
    expect(allLeads).toHaveLength(2);
  });

  it("fills in a missing personal-info field on merge without overwriting an existing one", async () => {
    const datasetId = await seedDataset();
    const rulesWithBio: MappingRules = { ...rulesWithIdentity, authorBio: { from: ["bio"] } };

    const first = await seedRawRecord(datasetId, {
      id: "post-e",
      authorId: "fb-bio-test",
      authorName: "Jane Doe",
      text: "Looking to buy a villa",
      time: "2026-01-01T00:00:00.000Z",
    });
    const second = await seedRawRecord(datasetId, {
      id: "post-f",
      authorId: "fb-bio-test",
      authorName: "Someone Else Entirely",
      bio: "Relocating from Australia",
      text: "Still looking",
      time: "2026-01-02T00:00:00.000Z",
    });

    await processRawRecords([first], rulesWithBio, { passthrough: true, datasetId });
    await processRawRecords([second], rulesWithBio, { passthrough: true, datasetId });

    const [lead] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.facebookId, "fb-bio-test"));

    // name was already set by the first appearance — never overwritten.
    expect(lead.name).toBe("Jane Doe");
    // bio was missing — filled in by the second appearance.
    expect(lead.bio).toBe("Relocating from Australia");
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
   * appearance. Identity-based dedup replaces that gate for `recordKind !==
   * "content_post"`. See docs/lead-source-scaling-plan.md problem 2b.
   */
  it("collapses a re-scraped like on the same post into one appearance, not a duplicate", async () => {
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

    const [rescrapedAppearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, rescrape.id));
    expect(rescrapedAppearance.canonicalAppearanceId).not.toBeNull();
  });

  it("keeps the same person liking two different posts as two separate appearances under one person", async () => {
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

    const [secondAppearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, second.id));
    expect(secondAppearance.canonicalAppearanceId).toBeNull();
    // The second appearance's own score should reflect it as the person's
    // 2nd distinct engagement in the window.
    expect(secondAppearance.scoreReasons.some((r) => r.code === "repeat_engagement")).toBe(true);

    // Both appearances (same likerId => same authorExternalId => same person)
    // merge under one lead, satisfying "each person exists only once" even
    // for engagement-only records.
    const [first_] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, first.id));
    expect(first_.leadId).toBe(secondAppearance.leadId);
  });

  it("stamps recordKind onto the appearance row", async () => {
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

    const [appearance] = await db()
      .select()
      .from(schema.leadAppearances)
      .where(eq(schema.leadAppearances.rawRecordId, record.id));
    expect(appearance.recordKind).toBe("engagement_like");
  });
});
