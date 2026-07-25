import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { dispatchAlertsForLeads } from "./dispatch";
import { resetDb } from "@/test/integration/db-helpers";

async function seedMatchingLead() {
  const [source] = await db()
    .insert(schema.sources)
    .values({ kind: "manual", name: `alert-test-source-${crypto.randomUUID()}` })
    .returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ sourceId: source.id, externalId: "alert-ds-1" })
    .returning();
  const [record] = await db()
    .insert(schema.rawRecords)
    .values({
      datasetId: dataset.id,
      sourceItemId: "alert-post-1",
      payload: {},
      contentHash: "h1",
      payloadHash: "p1",
    })
    .returning();
  const [lead] = await db()
    .insert(schema.leads)
    .values({
      rawRecordId: record.id,
      datasetId: dataset.id,
      externalId: "alert-post-1",
      body: "Looking to buy a villa, budget $100k",
      postedAt: new Date(),
      intent: "buyer",
      intentScore: 80,
      qualityScore: 40,
      isSpam: false,
    })
    .returning();
  return lead.id;
}

async function seedAlertRule() {
  const [rule] = await db()
    .insert(schema.alertRules)
    .values({
      name: `dispatch-test-rule-${crypto.randomUUID()}`,
      enabled: true,
      predicate: { all: [{ field: "intent", op: "eq", value: "buyer" }] },
      channels: ["email"],
      recipients: ["agent@example.com"],
    })
    .returning();
  return rule;
}

describe("dispatchAlertsForLeads", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("matches a qualifying lead against an enabled rule and records a delivery attempt", async () => {
    const leadId = await seedMatchingLead();
    await seedAlertRule();

    const result = await dispatchAlertsForLeads([leadId]);

    expect(result.matched).toBe(1);
    expect(result.suppressed).toBe(0);

    const deliveries = await db()
      .select()
      .from(schema.alertDeliveries)
      .where(eq(schema.alertDeliveries.leadId, leadId));
    expect(deliveries).toHaveLength(1);
  });

  it("suppresses a repeat dispatch for the same (rule, lead, channel) via the dedupeKey", async () => {
    const leadId = await seedMatchingLead();
    await seedAlertRule();

    await dispatchAlertsForLeads([leadId]);
    const second = await dispatchAlertsForLeads([leadId]);

    // This is what stops a mapping-profile backfill from re-alerting the whole
    // history: the second attempt at the same (rule, lead, channel) must be
    // suppressed by the dedupeKey's unique constraint, not sent again.
    expect(second.matched).toBe(1);
    expect(second.suppressed).toBe(1);

    const deliveries = await db()
      .select()
      .from(schema.alertDeliveries)
      .where(eq(schema.alertDeliveries.leadId, leadId));
    expect(deliveries).toHaveLength(1);
  });

  it("does not match a disabled rule", async () => {
    const leadId = await seedMatchingLead();
    const rule = await seedAlertRule();
    await db().update(schema.alertRules).set({ enabled: false }).where(eq(schema.alertRules.id, rule.id));

    const result = await dispatchAlertsForLeads([leadId]);
    expect(result.matched).toBe(0);
  });

  it("never matches a spam-flagged lead even if the predicate would otherwise fire", async () => {
    const leadId = await seedMatchingLead();
    await db().update(schema.leads).set({ isSpam: true }).where(eq(schema.leads.id, leadId));
    await seedAlertRule();

    const result = await dispatchAlertsForLeads([leadId]);
    expect(result.matched).toBe(0);
  });
});
