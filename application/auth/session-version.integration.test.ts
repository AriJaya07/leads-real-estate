import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { bumpSessionVersion } from "./session-version";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Session Version Test Co ${crypto.randomUUID()}`, slug: `session-version-${crypto.randomUUID()}` })
    .returning();
  return company;
}

async function seedUser() {
  const company = await seedCompany();
  const [user] = await db()
    .insert(schema.users)
    .values({ companyId: company.id, email: `session-version-${crypto.randomUUID()}@example.com`, role: "member" })
    .returning();
  return user;
}

describe("bumpSessionVersion", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("increments from the default and persists the new value", async () => {
    const user = await seedUser();
    expect(user.sessionVersion).toBe(1);

    const next = await bumpSessionVersion(user.id);
    expect(next).toBe(2);

    const [row] = await db().select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row.sessionVersion).toBe(2);
  });

  it("increments independently on repeated calls, never resetting", async () => {
    const user = await seedUser();
    await bumpSessionVersion(user.id);
    await bumpSessionVersion(user.id);
    const third = await bumpSessionVersion(user.id);
    expect(third).toBe(4);
  });

  it("never affects another user's version", async () => {
    const a = await seedUser();
    const b = await seedUser();

    await bumpSessionVersion(a.id);

    const [rowB] = await db().select().from(schema.users).where(eq(schema.users.id, b.id));
    expect(rowB.sessionVersion).toBe(1);
  });
});
