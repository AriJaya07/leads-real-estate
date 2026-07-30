import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { pruneOldRows } from "./prune-old-rows";
import { resetDb } from "@/test/integration/db-helpers";
import { LOGIN_ATTEMPTS_RETENTION_DAYS, SYNC_EVENTS_RETENTION_DAYS } from "@/shared/constants";

const DAY_MS = 86_400_000;

async function seedSyncRun() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Retention Test Co ${crypto.randomUUID()}`, slug: `retention-${crypto.randomUUID()}` })
    .returning();
  const [source] = await db()
    .insert(schema.sources)
    .values({ companyId: company.id, kind: "manual", name: `retention-test-source-${crypto.randomUUID()}` })
    .returning();
  const [dataset] = await db()
    .insert(schema.datasets)
    .values({ companyId: company.id, sourceId: source.id, externalId: "retention-dataset-1" })
    .returning();
  const [run] = await db()
    .insert(schema.syncRuns)
    .values({ companyId: company.id, datasetId: dataset.id, trigger: "manual", status: "succeeded" })
    .returning();
  return { companyId: company.id, syncRunId: run.id };
}

describe("pruneOldRows", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("deletes sync_events and login_attempts past their retention window, keeps recent ones", async () => {
    const now = new Date();
    const { companyId, syncRunId } = await seedSyncRun();

    const oldEvent = new Date(now.getTime() - (SYNC_EVENTS_RETENTION_DAYS + 1) * DAY_MS);
    const recentEvent = new Date(now.getTime() - (SYNC_EVENTS_RETENTION_DAYS - 1) * DAY_MS);
    await db()
      .insert(schema.syncEvents)
      .values([
        { companyId, syncRunId, stage: "test", message: "old", at: oldEvent },
        { companyId, syncRunId, stage: "test", message: "recent", at: recentEvent },
      ]);

    const oldAttempt = new Date(now.getTime() - (LOGIN_ATTEMPTS_RETENTION_DAYS + 1) * DAY_MS);
    const recentAttempt = new Date(now.getTime() - (LOGIN_ATTEMPTS_RETENTION_DAYS - 1) * DAY_MS);
    await db()
      .insert(schema.loginAttempts)
      .values([
        { email: "old@example.com", succeeded: false, createdAt: oldAttempt },
        { email: "recent@example.com", succeeded: false, createdAt: recentAttempt },
      ]);

    const result = await pruneOldRows(now);
    expect(result).toEqual({ syncEventsDeleted: 1, loginAttemptsDeleted: 1 });

    const remainingEvents = await db().select().from(schema.syncEvents);
    expect(remainingEvents).toHaveLength(1);
    expect(remainingEvents[0].message).toBe("recent");

    const remainingAttempts = await db().select().from(schema.loginAttempts);
    expect(remainingAttempts).toHaveLength(1);
    expect(remainingAttempts[0].email).toBe("recent@example.com");
  });

  it("is a no-op when nothing is past the retention window", async () => {
    const { companyId, syncRunId } = await seedSyncRun();
    await db().insert(schema.syncEvents).values({ companyId, syncRunId, stage: "test", message: "fresh" });
    await db().insert(schema.loginAttempts).values({ email: "fresh@example.com", succeeded: true });

    const result = await pruneOldRows();
    expect(result).toEqual({ syncEventsDeleted: 0, loginAttemptsDeleted: 0 });
  });
});
