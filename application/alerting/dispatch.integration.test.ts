import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { dispatchAlertsForLeads } from "./dispatch";
import { resetDb } from "@/test/integration/db-helpers";

async function seedMatchingLead(overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [lead] = await db()
    .insert(schema.leads)
    .values({
      name: "Jane Doe",
      leadType: "buyer",
      buyerScore: 80,
      confidenceScore: 40,
      ...overrides,
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
      predicate: { all: [{ field: "leadType", op: "eq", value: "buyer" }] },
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
    // suppressed by the dedupeKey's unique constraint, not sent again. Also
    // what makes it safe to pass the same person id through this function
    // repeatedly across many appearances of the same lead.
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

  /**
   * There's no `isSpam` at the person level anymore — a spam appearance simply
   * never contributes to `buyerScore` during rollup (`recomputePersonRollup`),
   * so a person whose only appearances were spam naturally never clears a
   * buyer-score threshold. This is the person-level equivalent of the old
   * "never matches a spam-flagged lead" test.
   */
  it("does not match a lead below the rule's buyerScore threshold", async () => {
    const leadId = await seedMatchingLead({ buyerScore: 10 });
    await db()
      .insert(schema.alertRules)
      .values({
        name: `dispatch-threshold-rule-${crypto.randomUUID()}`,
        enabled: true,
        predicate: {
          all: [
            { field: "leadType", op: "eq", value: "buyer" },
            { field: "buyerScore", op: "gte", value: 60 },
          ],
        },
        channels: ["email"],
        recipients: ["agent@example.com"],
      });

    const result = await dispatchAlertsForLeads([leadId]);
    expect(result.matched).toBe(0);
  });
});
