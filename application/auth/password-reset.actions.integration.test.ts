import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { hashToken } from "@/infrastructure/auth/tokens";
import { countRecentResetRequests, isPasswordResetTokenValid } from "./password-reset.actions";
import { resetDb } from "@/test/integration/db-helpers";

async function seedUser() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Reset Test Co ${crypto.randomUUID()}`, slug: `reset-test-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db()
    .insert(schema.users)
    .values({ companyId: company.id, email: `reset-${crypto.randomUUID()}@example.com`, role: "member" })
    .returning();
  return user;
}

async function seedToken(userId: string, overrides: Partial<typeof schema.passwordResetTokens.$inferInsert> = {}) {
  const token = `token-${crypto.randomUUID()}`;
  await db()
    .insert(schema.passwordResetTokens)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ...overrides,
    });
  return token;
}

describe("isPasswordResetTokenValid", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("is true for a fresh, unused, unexpired token", async () => {
    const user = await seedUser();
    const token = await seedToken(user.id);
    expect(await isPasswordResetTokenValid(token)).toBe(true);
  });

  it("is false for an unknown token", async () => {
    expect(await isPasswordResetTokenValid("no-such-token")).toBe(false);
  });

  it("is false for an expired token", async () => {
    const user = await seedUser();
    const token = await seedToken(user.id, { expiresAt: new Date(Date.now() - 60 * 1000) });
    expect(await isPasswordResetTokenValid(token)).toBe(false);
  });

  it("is false for an already-used token", async () => {
    const user = await seedUser();
    const token = await seedToken(user.id, { usedAt: new Date() });
    expect(await isPasswordResetTokenValid(token)).toBe(false);
  });
});

describe("countRecentResetRequests", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("counts only recent, and only this user's, reset-token rows", async () => {
    const user = await seedUser();
    const other = await seedUser();
    await seedToken(user.id);
    await seedToken(user.id);
    await seedToken(other.id);
    await seedToken(user.id, { createdAt: new Date(Date.now() - 60 * 60 * 1000) }); // outside the window

    expect(await countRecentResetRequests(user.id)).toBe(2);
    expect(await countRecentResetRequests(other.id)).toBe(1);
  });

  it("counts a used or expired token row the same as a fresh one — it's a request throttle, not a validity check", async () => {
    const user = await seedUser();
    await seedToken(user.id, { usedAt: new Date() });
    await seedToken(user.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await countRecentResetRequests(user.id)).toBe(2);
  });
});
