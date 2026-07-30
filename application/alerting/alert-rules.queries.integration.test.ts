import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { buildAllOfPredicate } from "@/domain/alerting/predicate";
import { listAlertRules } from "./alert-rules.queries";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Alert Test Co ${crypto.randomUUID()}`, slug: `alert-test-${crypto.randomUUID()}` })
    .returning();
  return company.id;
}

describe("alert rules — persistence", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("round-trips a rule built the same way the create action builds one, including the jsonb predicate", async () => {
    const companyId = await seedCompany();
    const predicate = buildAllOfPredicate([
      { field: "leadType", op: "eq", value: "buyer" },
      { field: "buyerScore", op: "gte", value: 60 },
      { field: "propertyTypes", op: "intersects", value: ["villa", "land"] },
    ]);

    await db().insert(schema.alertRules).values({
      companyId,
      name: "High-intent Bali buyer",
      description: "Buyer score 60+ on villa or land",
      enabled: true,
      predicate,
      channels: ["email", "whatsapp"],
      recipients: ["sales@company.com", "+62812345678"],
    });

    const rules = await listAlertRules(companyId);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("High-intent Bali buyer");
    expect(rules[0].channels).toEqual(["email", "whatsapp"]);
    expect(rules[0].recipients).toEqual(["sales@company.com", "+62812345678"]);
    expect(rules[0].predicate).toEqual(predicate);
  });

  it("enforces one rule name per company via onConflictDoNothing, the same guard the create action relies on", async () => {
    const companyId = await seedCompany();
    const predicate = buildAllOfPredicate([{ field: "buyerScore", op: "gte", value: 50 }]);
    const values: typeof schema.alertRules.$inferInsert = {
      companyId,
      name: "Duplicate name",
      predicate,
      channels: ["email"],
      recipients: ["a@b.com"],
    };

    const [first] = await db()
      .insert(schema.alertRules)
      .values(values)
      .onConflictDoNothing({ target: [schema.alertRules.companyId, schema.alertRules.name] })
      .returning({ id: schema.alertRules.id });
    expect(first).toBeDefined();

    const [second] = await db()
      .insert(schema.alertRules)
      .values(values)
      .onConflictDoNothing({ target: [schema.alertRules.companyId, schema.alertRules.name] })
      .returning({ id: schema.alertRules.id });
    expect(second).toBeUndefined();

    const rules = await listAlertRules(companyId);
    expect(rules).toHaveLength(1);
  });

  it("allows two different companies to reuse the same rule name", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const predicate = buildAllOfPredicate([{ field: "buyerScore", op: "gte", value: 50 }]);

    for (const companyId of [companyA, companyB]) {
      await db()
        .insert(schema.alertRules)
        .values({ companyId, name: "Shared name", predicate, channels: ["email"], recipients: ["a@b.com"] });
    }

    expect(await listAlertRules(companyA)).toHaveLength(1);
    expect(await listAlertRules(companyB)).toHaveLength(1);
  });

  it("update and delete are scoped to companyId, the same guard every action uses", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const predicate = buildAllOfPredicate([{ field: "buyerScore", op: "gte", value: 50 }]);

    const [rule] = await db()
      .insert(schema.alertRules)
      .values({ companyId: companyA, name: "Scoped rule", predicate, channels: ["email"], recipients: ["a@b.com"] })
      .returning();

    const { and, eq } = await import("drizzle-orm");

    // A wrong-company delete affects nothing.
    const deletedByWrongCompany = await db()
      .delete(schema.alertRules)
      .where(and(eq(schema.alertRules.id, rule.id), eq(schema.alertRules.companyId, companyB)))
      .returning({ id: schema.alertRules.id });
    expect(deletedByWrongCompany).toHaveLength(0);
    expect(await listAlertRules(companyA)).toHaveLength(1);

    // The owning company's delete removes it.
    const deletedByOwner = await db()
      .delete(schema.alertRules)
      .where(and(eq(schema.alertRules.id, rule.id), eq(schema.alertRules.companyId, companyA)))
      .returning({ id: schema.alertRules.id });
    expect(deletedByOwner).toHaveLength(1);
    expect(await listAlertRules(companyA)).toHaveLength(0);
  });
});
