import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { runAutoAssignment } from "./auto-assign";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Auto-assign Test Co ${crypto.randomUUID()}`, slug: `auto-assign-test-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedUser(companyId: string, overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const [user] = await db()
    .insert(schema.users)
    .values({ companyId, email: `user-${crypto.randomUUID()}@example.com`, ...overrides })
    .returning();
  return user.id;
}

async function seedLead(companyId: string, overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [lead] = await db()
    .insert(schema.leads)
    .values({ companyId, name: "Auto-assign Lead", leadType: "buyer", ...overrides })
    .returning();
  return lead.id;
}

async function enableAutoAssign(companyId: string) {
  await db().insert(schema.automationSettings).values({ companyId, autoAssignEnabled: true });
}

async function leadState(leadId: string) {
  const [row] = await db().select().from(schema.leadStates).where(eq(schema.leadStates.leadId, leadId)).limit(1);
  return row ?? null;
}

describe("runAutoAssignment", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("does nothing when autoAssignEnabled is off (the default — no automation_settings row at all)", async () => {
    const companyId = await seedCompany();
    await seedUser(companyId);
    const leadId = await seedLead(companyId);

    const result = await runAutoAssignment(companyId);

    expect(result.assigned).toBe(0);
    expect(await leadState(leadId)).toBeNull();
  });

  it("assigns an unassigned lead to the company's only eligible user", async () => {
    const companyId = await seedCompany();
    await enableAutoAssign(companyId);
    const userId = await seedUser(companyId);
    const leadId = await seedLead(companyId);

    const result = await runAutoAssignment(companyId);

    expect(result.assigned).toBe(1);
    const state = await leadState(leadId);
    expect(state?.assignedTo).toBe(userId);
    expect(state?.status).toBe("new");
  });

  it("balances load: two unassigned leads go to two different users when both start even", async () => {
    const companyId = await seedCompany();
    await enableAutoAssign(companyId);
    const userA = await seedUser(companyId);
    const userB = await seedUser(companyId);
    const leadOne = await seedLead(companyId);
    const leadTwo = await seedLead(companyId);

    const result = await runAutoAssignment(companyId);

    expect(result.assigned).toBe(2);
    const assignees = new Set([(await leadState(leadOne))?.assignedTo, (await leadState(leadTwo))?.assignedTo]);
    expect(assignees).toEqual(new Set([userA, userB]));
  });

  it("never assigns to a user who opted out via acceptsAssignments", async () => {
    const companyId = await seedCompany();
    await enableAutoAssign(companyId);
    const optedOut = await seedUser(companyId, { acceptsAssignments: false });
    const optedIn = await seedUser(companyId);
    const leadId = await seedLead(companyId);

    await runAutoAssignment(companyId);

    const state = await leadState(leadId);
    expect(state?.assignedTo).toBe(optedIn);
    expect(state?.assignedTo).not.toBe(optedOut);
  });

  it("does not touch a lead that already has an assignee", async () => {
    const companyId = await seedCompany();
    await enableAutoAssign(companyId);
    const originalOwner = await seedUser(companyId);
    await seedUser(companyId); // a second eligible user, to prove round-robin doesn't reassign
    const leadId = await seedLead(companyId);
    await db().insert(schema.leadStates).values({ leadId, companyId, assignedTo: originalOwner });

    const result = await runAutoAssignment(companyId);

    expect(result.assigned).toBe(0);
    expect((await leadState(leadId))?.assignedTo).toBe(originalOwner);
  });

  it("skips closed and rejected leads — nothing to work, nothing to assign", async () => {
    const companyId = await seedCompany();
    await enableAutoAssign(companyId);
    await seedUser(companyId);
    const closedLead = await seedLead(companyId);
    const rejectedLead = await seedLead(companyId);
    await db().insert(schema.leadStates).values([
      { leadId: closedLead, companyId, status: "closed" },
      { leadId: rejectedLead, companyId, status: "rejected" },
    ]);

    const result = await runAutoAssignment(companyId);

    expect(result.assigned).toBe(0);
  });

  it("writes an auto-assigned lead_events row", async () => {
    const companyId = await seedCompany();
    await enableAutoAssign(companyId);
    const userId = await seedUser(companyId);
    const leadId = await seedLead(companyId);

    await runAutoAssignment(companyId);

    const [event] = await db().select().from(schema.leadEvents).where(eq(schema.leadEvents.leadId, leadId));
    expect(event.type).toBe("assigned");
    expect(event.payload).toEqual({ assignedTo: userId, auto: true });
  });
});
