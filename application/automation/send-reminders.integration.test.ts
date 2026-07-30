import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { sendStaleLeadReminders } from "./send-reminders";
import { resetDb } from "@/test/integration/db-helpers";

const DAY_MS = 86_400_000;

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Reminder Test Co ${crypto.randomUUID()}`, slug: `reminder-test-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

async function seedLeadWithState(
  companyId: string,
  status: string,
  updatedAt: Date,
): Promise<string> {
  const [lead] = await db()
    .insert(schema.leads)
    .values({ companyId, name: "Stale Lead", leadType: "buyer" })
    .returning();
  await db()
    .insert(schema.leadStates)
    .values({ leadId: lead.id, companyId, status: status as never, updatedAt });
  return lead.id;
}

describe("sendStaleLeadReminders", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("does nothing when reminderEnabled is off (the default)", async () => {
    const companyId = await seedCompany();
    await seedLeadWithState(companyId, "contacted", new Date(Date.now() - 10 * DAY_MS));

    const result = await sendStaleLeadReminders(companyId);

    expect(result).toEqual({ remindedLeadCount: 0, sent: false });
  });

  it("does nothing when enabled but no recipients are configured", async () => {
    const companyId = await seedCompany();
    await db().insert(schema.automationSettings).values({ companyId, reminderEnabled: true, reminderRecipients: [] });
    await seedLeadWithState(companyId, "contacted", new Date(Date.now() - 10 * DAY_MS));

    const result = await sendStaleLeadReminders(companyId);

    expect(result).toEqual({ remindedLeadCount: 0, sent: false });
  });

  it("finds a lead that's been sitting in an active status past the threshold", async () => {
    const companyId = await seedCompany();
    await db()
      .insert(schema.automationSettings)
      .values({ companyId, reminderEnabled: true, reminderStaleDays: 3, reminderRecipients: ["agent@example.com"] });
    await seedLeadWithState(companyId, "contacted", new Date(Date.now() - 5 * DAY_MS));

    const result = await sendStaleLeadReminders(companyId);

    expect(result.remindedLeadCount).toBe(1);
  });

  it("excludes a lead updated more recently than the threshold", async () => {
    const companyId = await seedCompany();
    await db()
      .insert(schema.automationSettings)
      .values({ companyId, reminderEnabled: true, reminderStaleDays: 3, reminderRecipients: ["agent@example.com"] });
    await seedLeadWithState(companyId, "contacted", new Date(Date.now() - 1 * DAY_MS));

    const result = await sendStaleLeadReminders(companyId);

    expect(result.remindedLeadCount).toBe(0);
  });

  it("excludes new, closed, and rejected leads regardless of how stale", async () => {
    const companyId = await seedCompany();
    await db()
      .insert(schema.automationSettings)
      .values({ companyId, reminderEnabled: true, reminderStaleDays: 3, reminderRecipients: ["agent@example.com"] });
    const longAgo = new Date(Date.now() - 30 * DAY_MS);
    await seedLeadWithState(companyId, "new", longAgo);
    await seedLeadWithState(companyId, "closed", longAgo);
    await seedLeadWithState(companyId, "rejected", longAgo);

    const result = await sendStaleLeadReminders(companyId);

    expect(result.remindedLeadCount).toBe(0);
  });

  it("does not re-run within reminderStaleDays of the last send attempt", async () => {
    const companyId = await seedCompany();
    await db()
      .insert(schema.automationSettings)
      .values({ companyId, reminderEnabled: true, reminderStaleDays: 3, reminderRecipients: ["agent@example.com"] });
    await seedLeadWithState(companyId, "contacted", new Date(Date.now() - 5 * DAY_MS));

    const first = await sendStaleLeadReminders(companyId);
    expect(first.remindedLeadCount).toBe(1);

    const second = await sendStaleLeadReminders(companyId);
    expect(second).toEqual({ remindedLeadCount: 0, sent: false });

    const [settings] = await db()
      .select()
      .from(schema.automationSettings)
      .where(eq(schema.automationSettings.companyId, companyId));
    expect(settings.reminderLastSentAt).not.toBeNull();
  });
});
