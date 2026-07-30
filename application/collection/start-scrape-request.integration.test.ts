import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { registerActorRunner } from "@/infrastructure/connectors/registry";
import { startScrapeRequest } from "./start-scrape-request";
import { refreshScrapeStatus } from "./refresh-scrape-status";
import { resetDb } from "@/test/integration/db-helpers";
import type { ActorRun, ActorRunner, ActorRunStatus, StartActorRunInput } from "@/domain/sync/ports";

/**
 * In-memory fake standing in for the real Apify actor runner, same pattern as
 * `sync-dataset.integration.test.ts`'s `fakeConnector` — registered so
 * `startScrapeRequest`/`refreshScrapeStatus` exercise their real dedup/budget/
 * status-mapping logic against a real database, with zero network calls.
 */
function fakeActorRunner(status: ActorRunStatus = "RUNNING"): ActorRunner & { calls: StartActorRunInput[] } {
  let counter = 0;
  const runs = new Map<string, ActorRun>();
  const calls: StartActorRunInput[] = [];
  return {
    calls,
    async startRun(input: StartActorRunInput): Promise<ActorRun> {
      calls.push(input);
      counter += 1;
      const run: ActorRun = {
        id: `fake-run-${counter}`,
        actorId: input.actorId,
        status,
        defaultDatasetId: null,
        startedAt: new Date(),
        finishedAt: null,
        usageUsd: null,
      };
      runs.set(run.id, run);
      return run;
    },
    async getRun(runId: string): Promise<ActorRun | null> {
      return runs.get(runId) ?? null;
    },
  };
}

function throwingActorRunner(message: string): ActorRunner {
  return {
    async startRun(): Promise<ActorRun> {
      throw new Error(message);
    },
    async getRun(): Promise<ActorRun | null> {
      return null;
    },
  };
}

async function seedCompanyAndUser() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Collection Test Co ${crypto.randomUUID()}`, slug: `collection-test-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db()
    .insert(schema.users)
    .values({ companyId: company.id, email: `${crypto.randomUUID()}@example.com`, role: "manager" })
    .returning();
  return { companyId: company.id, userId: user.id };
}

async function seedTemplate(overrides: Partial<typeof schema.actorTemplates.$inferInsert> = {}) {
  const [template] = await db()
    .insert(schema.actorTemplates)
    .values({
      name: `Test Template ${crypto.randomUUID()}`,
      platform: "instagram",
      requirementKind: "hashtag_search",
      actorId: "apify/instagram-scraper",
      defaultInput: { resultsType: "posts" },
      requiredParams: ["directUrls"],
      enabled: true,
      ...overrides,
    })
    .returning();
  return template;
}

async function seedCompanyWithBudget(maxApifyRequestsPerMonth: number) {
  const { companyId, userId } = await seedCompanyAndUser();
  const [plan] = await db()
    .insert(schema.plans)
    .values({
      name: `Collection Budget Plan ${crypto.randomUUID()}`,
      maxDatasets: 10,
      maxRawRecordsPerMonth: 1000,
      maxLeadsPerMonth: 1000,
      maxApifyRequestsPerMonth,
      maxStorageKb: 1_000_000,
      dataRetentionDays: 365,
    })
    .returning();
  await db().insert(schema.subscriptions).values({ companyId, planId: plan.id, status: "active" });
  return { companyId, userId };
}

describe("startScrapeRequest", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("starts a run and records it against the requesting company", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    const runner = fakeActorRunner("RUNNING");
    registerActorRunner("apify", runner);

    const result = await startScrapeRequest({
      companyId,
      requestedByUserId: userId,
      actorTemplateId: template.id,
      params: { directUrls: ["https://instagram.com/x"] },
    });

    expect(result.reused).toBe(false);
    expect(result.status).toBe("running");
    expect(result.apifyRunId).toBe("fake-run-1");
    expect(runner.calls).toHaveLength(1);
    // User params + template default merge into the actual actor input sent upstream.
    expect(runner.calls[0].input).toEqual({
      resultsType: "posts",
      directUrls: ["https://instagram.com/x"],
    });
  });

  it("rejects a request missing a required param before ever calling the actor", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    const runner = fakeActorRunner();
    registerActorRunner("apify", runner);

    await expect(
      startScrapeRequest({ companyId, requestedByUserId: userId, actorTemplateId: template.id, params: {} }),
    ).rejects.toThrow(/Missing required parameter/);
    expect(runner.calls).toHaveLength(0);
  });

  it("reuses a recent identical in-flight request instead of starting a second run", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    const runner = fakeActorRunner("RUNNING");
    registerActorRunner("apify", runner);

    const params = { directUrls: ["https://instagram.com/x"] };
    const first = await startScrapeRequest({ companyId, requestedByUserId: userId, actorTemplateId: template.id, params });
    const second = await startScrapeRequest({ companyId, requestedByUserId: userId, actorTemplateId: template.id, params });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.id).toBe(first.id);
    expect(runner.calls).toHaveLength(1);
  });

  it("does not reuse across different params (different fingerprint)", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    const runner = fakeActorRunner("RUNNING");
    registerActorRunner("apify", runner);

    await startScrapeRequest({
      companyId,
      requestedByUserId: userId,
      actorTemplateId: template.id,
      params: { directUrls: ["https://instagram.com/a"] },
    });
    const second = await startScrapeRequest({
      companyId,
      requestedByUserId: userId,
      actorTemplateId: template.id,
      params: { directUrls: ["https://instagram.com/b"] },
    });

    expect(second.reused).toBe(false);
    expect(runner.calls).toHaveLength(2);
  });

  it("refuses to start once the plan's monthly Apify request budget is spent", async () => {
    const { companyId, userId } = await seedCompanyWithBudget(0);
    const template = await seedTemplate();
    registerActorRunner("apify", fakeActorRunner());

    await expect(
      startScrapeRequest({
        companyId,
        requestedByUserId: userId,
        actorTemplateId: template.id,
        params: { directUrls: ["https://instagram.com/x"] },
      }),
    ).rejects.toThrow(/budget/i);
  });

  it("marks the request failed, with the error recorded, when the actor fails to start", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    registerActorRunner("apify", throwingActorRunner("Apify request failed: 401 Unauthorized"));

    await expect(
      startScrapeRequest({
        companyId,
        requestedByUserId: userId,
        actorTemplateId: template.id,
        params: { directUrls: ["https://instagram.com/x"] },
      }),
    ).rejects.toThrow(/Failed to start scrape/);

    const [row] = await db().select().from(schema.scrapeRequests).where(eq(schema.scrapeRequests.companyId, companyId));
    expect(row.status).toBe("failed");
    expect(row.errorSummary).toMatch(/401/);
  });

  it("rejects a disabled actor template", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate({ enabled: false });
    registerActorRunner("apify", fakeActorRunner());

    await expect(
      startScrapeRequest({ companyId, requestedByUserId: userId, actorTemplateId: template.id, params: {} }),
    ).rejects.toThrow(/not found or disabled/);
  });
});

describe("refreshScrapeStatus", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("polls the actor runner and updates status/cost/dataset from the live run", async () => {
    const { companyId, userId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    const runner = fakeActorRunner("RUNNING");
    registerActorRunner("apify", runner);

    const started = await startScrapeRequest({
      companyId,
      requestedByUserId: userId,
      actorTemplateId: template.id,
      params: { directUrls: ["https://instagram.com/x"] },
    });

    // Simulate the run finishing between the trigger and the manual "check now".
    const [liveRun] = [...(await db().select().from(schema.scrapeRequests))];
    void liveRun;
    const runnerRuns = (runner as unknown as { getRun: (id: string) => Promise<ActorRun | null> });
    const existing = await runnerRuns.getRun(started.apifyRunId!);
    expect(existing).not.toBeNull();

    // Mutate the fake's underlying state by re-registering a runner whose getRun
    // reports the same run id as succeeded.
    registerActorRunner("apify", {
      async startRun() {
        throw new Error("not expected");
      },
      async getRun() {
        return {
          id: started.apifyRunId!,
          actorId: template.actorId,
          status: "SUCCEEDED",
          defaultDatasetId: "fake-dataset-id",
          startedAt: new Date(),
          finishedAt: new Date(),
          usageUsd: 1.23,
        };
      },
    });

    const result = await refreshScrapeStatus(companyId, started.id);
    expect(result.status).toBe("succeeded");

    const [row] = await db().select().from(schema.scrapeRequests).where(eq(schema.scrapeRequests.id, started.id));
    expect(row.status).toBe("succeeded");
    expect(row.apifyDatasetId).toBe("fake-dataset-id");
    expect(row.usageUsd).toBe(1.23);
  });

  it("scopes lookups to the requesting company", async () => {
    const { companyId: ownerCompanyId, userId } = await seedCompanyAndUser();
    const { companyId: otherCompanyId } = await seedCompanyAndUser();
    const template = await seedTemplate();
    registerActorRunner("apify", fakeActorRunner("RUNNING"));

    const started = await startScrapeRequest({
      companyId: ownerCompanyId,
      requestedByUserId: userId,
      actorTemplateId: template.id,
      params: { directUrls: ["https://instagram.com/x"] },
    });

    await expect(refreshScrapeStatus(otherCompanyId, started.id)).rejects.toThrow(/not found/i);
  });
});
