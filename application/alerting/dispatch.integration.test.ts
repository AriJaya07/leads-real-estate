import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { dispatchAlertsForLeads } from "./dispatch";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Dispatch Test Co ${crypto.randomUUID()}`, slug: `dispatch-test-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedMatchingLead(companyId: string, overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [lead] = await db()
    .insert(schema.leads)
    .values({
      companyId,
      name: "Jane Doe",
      leadType: "buyer",
      buyerScore: 80,
      confidenceScore: 40,
      ...overrides,
    })
    .returning();
  return lead.id;
}

async function seedAlertRule(companyId: string) {
  const [rule] = await db()
    .insert(schema.alertRules)
    .values({
      companyId,
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
    const companyId = await seedCompany();
    const leadId = await seedMatchingLead(companyId);
    await seedAlertRule(companyId);

    const result = await dispatchAlertsForLeads(companyId, [leadId]);

    expect(result.matched).toBe(1);
    expect(result.suppressed).toBe(0);

    const deliveries = await db()
      .select()
      .from(schema.alertDeliveries)
      .where(eq(schema.alertDeliveries.leadId, leadId));
    expect(deliveries).toHaveLength(1);
  });

  it("suppresses a repeat dispatch for the same (rule, lead, channel) via the dedupeKey", async () => {
    const companyId = await seedCompany();
    const leadId = await seedMatchingLead(companyId);
    await seedAlertRule(companyId);

    await dispatchAlertsForLeads(companyId, [leadId]);
    const second = await dispatchAlertsForLeads(companyId, [leadId]);

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
    const companyId = await seedCompany();
    const leadId = await seedMatchingLead(companyId);
    const rule = await seedAlertRule(companyId);
    await db().update(schema.alertRules).set({ enabled: false }).where(eq(schema.alertRules.id, rule.id));

    const result = await dispatchAlertsForLeads(companyId, [leadId]);
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
    const companyId = await seedCompany();
    const leadId = await seedMatchingLead(companyId, { buyerScore: 10 });
    await db()
      .insert(schema.alertRules)
      .values({
        companyId,
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

    const result = await dispatchAlertsForLeads(companyId, [leadId]);
    expect(result.matched).toBe(0);
  });

  it("never matches a lead belonging to a different company", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const leadId = await seedMatchingLead(companyB);
    await seedAlertRule(companyA);

    const result = await dispatchAlertsForLeads(companyA, [leadId]);
    expect(result.evaluated).toBe(0);
    expect(result.matched).toBe(0);
  });
});
