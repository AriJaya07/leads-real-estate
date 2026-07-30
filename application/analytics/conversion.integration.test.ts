import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { getConversionFunnel } from "./conversion";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Funnel Test Co ${crypto.randomUUID()}`, slug: `funnel-test-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedLead(companyId: string) {
  const [lead] = await db().insert(schema.leads).values({ companyId, name: "Funnel Lead", leadType: "buyer" }).returning();
  return lead.id;
}

/**
 * Writes the same `status_changed` event shape `setLeadStatus` writes, for
 * each status in order, and — like the real action — also upserts
 * `lead_states.status` to the final one. The funnel's stage counts read only
 * `lead_events`, but its `rejected` count reads current `lead_states.status`,
 * same as `setLeadStatus` really does both writes together.
 */
async function progressThrough(companyId: string, leadId: string, statuses: string[]) {
  for (const status of statuses) {
    await db().insert(schema.leadEvents).values({
      companyId,
      leadId,
      type: "status_changed",
      payload: { status },
    });
  }
  const finalStatus = statuses[statuses.length - 1] as (typeof schema.leadStates.$inferInsert)["status"];
  await db()
    .insert(schema.leadStates)
    .values({ leadId, companyId, status: finalStatus })
    .onConflictDoUpdate({ target: schema.leadStates.leadId, set: { status: finalStatus } });
}

describe("getConversionFunnel", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("returns all-zero stages and 0% rates for a company with no leads", async () => {
    const companyId = await seedCompany();
    const funnel = await getConversionFunnel(companyId);

    expect(funnel.total).toBe(0);
    expect(funnel.rejected).toBe(0);
    expect(funnel.overallConversionPct).toBe(0);
    expect(funnel.stages.every((s) => s.count === 0 && s.ofTotalPct === 0)).toBe(true);
    expect(funnel.stages[0].conversionFromPreviousPct).toBeNull();
  });

  it("computes a cohort funnel — 'ever reached', not 'currently at' — against a hand-built scenario", async () => {
    const companyId = await seedCompany();

    // A: untouched, stays "new".
    await seedLead(companyId);
    // B: reaches "contacted" only.
    const leadB = await seedLead(companyId);
    await progressThrough(companyId, leadB, ["contacted"]);
    // C: reaches "interested" (via qualified).
    const leadC = await seedLead(companyId);
    await progressThrough(companyId, leadC, ["contacted", "qualified", "interested"]);
    // D: goes all the way to "closed".
    const leadD = await seedLead(companyId);
    await progressThrough(companyId, leadD, ["contacted", "qualified", "interested", "negotiation", "closed"]);
    // E: reaches "contacted", then gets rejected — should still count toward
    // the "contacted" stage (it genuinely got that far) while also showing
    // up in the separate `rejected` count.
    const leadE = await seedLead(companyId);
    await progressThrough(companyId, leadE, ["contacted", "rejected"]);

    const funnel = await getConversionFunnel(companyId);

    expect(funnel.total).toBe(5);
    expect(funnel.rejected).toBe(1);

    const byStatus = Object.fromEntries(funnel.stages.map((s) => [s.status, s]));
    expect(byStatus.new.count).toBe(5);
    expect(byStatus.contacted.count).toBe(4); // B, C, D, E
    expect(byStatus.qualified.count).toBe(2); // C, D
    expect(byStatus.interested.count).toBe(2); // C, D
    expect(byStatus.negotiation.count).toBe(1); // D
    expect(byStatus.closed.count).toBe(1); // D

    // Stage-to-stage conversion, not "of total" — each is count / previous count.
    expect(byStatus.contacted.conversionFromPreviousPct).toBeCloseTo(80, 5); // 4/5
    expect(byStatus.qualified.conversionFromPreviousPct).toBeCloseTo(50, 5); // 2/4
    expect(byStatus.interested.conversionFromPreviousPct).toBeCloseTo(100, 5); // 2/2
    expect(byStatus.negotiation.conversionFromPreviousPct).toBeCloseTo(50, 5); // 1/2
    expect(byStatus.closed.conversionFromPreviousPct).toBeCloseTo(100, 5); // 1/1

    expect(byStatus.contacted.ofTotalPct).toBeCloseTo(80, 5); // 4/5 of the whole base
    expect(funnel.overallConversionPct).toBeCloseTo(20, 5); // 1/5 closed
  });

  it("a lead rejected straight from new (no intermediate stage) only counts toward 'new'", async () => {
    const companyId = await seedCompany();
    const leadId = await seedLead(companyId);
    await progressThrough(companyId, leadId, ["rejected"]);

    const funnel = await getConversionFunnel(companyId);
    const byStatus = Object.fromEntries(funnel.stages.map((s) => [s.status, s]));

    expect(funnel.rejected).toBe(1);
    expect(byStatus.new.count).toBe(1);
    expect(byStatus.contacted.count).toBe(0);
  });
});
