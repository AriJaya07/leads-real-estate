import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { countRecentFailedAttempts, recordLoginAttempt } from "./login-attempts";
import { resetDb } from "@/test/integration/db-helpers";

describe("login attempt throttling", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("counts only failed attempts for the given email within the window", async () => {
    await recordLoginAttempt("agent@example.com", false);
    await recordLoginAttempt("agent@example.com", false);
    await recordLoginAttempt("agent@example.com", true);
    await recordLoginAttempt("someone-else@example.com", false);

    expect(await countRecentFailedAttempts("agent@example.com")).toBe(2);
    expect(await countRecentFailedAttempts("someone-else@example.com")).toBe(1);
    expect(await countRecentFailedAttempts("never-tried@example.com")).toBe(0);
  });

  it("ignores failed attempts outside the throttling window", async () => {
    const [old] = await db()
      .insert(schema.loginAttempts)
      .values({ email: "agent@example.com", succeeded: false })
      .returning();

    // Backdate it past the window rather than waiting in real time.
    await db()
      .update(schema.loginAttempts)
      .set({ createdAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(schema.loginAttempts.id, old.id));

    expect(await countRecentFailedAttempts("agent@example.com")).toBe(0);
  });
});
