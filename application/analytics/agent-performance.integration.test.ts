import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { getAgentPerformance } from "./agent-performance";
import { resetDb } from "@/test/integration/db-helpers";

const MINUTE_MS = 60_000;

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Agent Perf Test Co ${crypto.randomUUID()}`, slug: `agent-perf-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedUser(companyId: string) {
  const [user] = await db()
    .insert(schema.users)
    .values({ companyId, email: `agent-${crypto.randomUUID()}@example.com` })
    .returning();
  return user.id;
}

async function seedLeadWithState(
  companyId: string,
  assignedTo: string,
  overrides: Partial<typeof schema.leadStates.$inferInsert> & { createdAt?: Date } = {},
) {
  const { createdAt, ...stateOverrides } = overrides;
  const [lead] = await db()
    .insert(schema.leads)
    .values({ companyId, createdAt })
    .returning();
  await db()
    .insert(schema.leadStates)
    .values({ leadId: lead.id, companyId, assignedTo, ...stateOverrides });
  return lead.id;
}

describe("getAgentPerformance", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("computes per-agent workload, median time-to-first-touch, and revenue independently per agent", async () => {
    const companyId = await seedCompany();
    const agentA = await seedUser(companyId);
    const agentB = await seedUser(companyId);
    const agentC = await seedUser(companyId); // never gets a lead

    const createdAt = new Date("2026-01-01T00:00:00Z");
    // Agent A: two contacted leads, 30 and 90 minutes to first touch — median 60.
    await seedLeadWithState(companyId, agentA, {
      createdAt,
      firstContactedAt: new Date(createdAt.getTime() + 30 * MINUTE_MS),
      status: "closed",
      dealValueUsd: 5_000,
    });
    await seedLeadWithState(companyId, agentA, {
      createdAt,
      firstContactedAt: new Date(createdAt.getTime() + 90 * MINUTE_MS),
      status: "contacted",
    });

    // Agent B: one lead, never contacted, never closed.
    await seedLeadWithState(companyId, agentB, {});

    const results = await getAgentPerformance(companyId);
    const byUserId = Object.fromEntries(results.map((r) => [r.userId, r]));

    expect(byUserId[agentA].leadCount).toBe(2);
    expect(byUserId[agentA].contactedCount).toBe(2);
    expect(byUserId[agentA].closedCount).toBe(1);
    expect(byUserId[agentA].closedRevenueUsd).toBe(5_000);
    expect(byUserId[agentA].medianTimeToFirstTouchMinutes).toBe(60);
    expect(byUserId[agentA].conversionPct).toBeCloseTo(50, 5); // 1/2 closed

    expect(byUserId[agentB].leadCount).toBe(1);
    expect(byUserId[agentB].contactedCount).toBe(0);
    expect(byUserId[agentB].medianTimeToFirstTouchMinutes).toBeNull();
    expect(byUserId[agentB].conversionPct).toBe(0);

    // An agent with zero assigned leads still appears, all-zero — coverage
    // gaps in the round-robin pool are a real finding, not noise to hide.
    expect(byUserId[agentC]).toBeDefined();
    expect(byUserId[agentC].leadCount).toBe(0);
    expect(byUserId[agentC].medianTimeToFirstTouchMinutes).toBeNull();
    expect(byUserId[agentC].conversionPct).toBe(0);
  });
});
