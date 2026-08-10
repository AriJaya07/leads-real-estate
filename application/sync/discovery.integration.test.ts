import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { registerConnector } from "@/infrastructure/connectors/registry";
import { discoverAllSources } from "./discovery";
import { resetDb } from "@/test/integration/db-helpers";
import type { RemoteDataset, RemoteItemPage, SourceConnector } from "@/domain/sync/ports";

/**
 * Same shared-account shape the real Apify connector has: one `listDatasets()`
 * call returns the same full list regardless of which company's source asked
 * — exactly the scenario the cross-company collision guard exists for. See
 * docs/multi-tenant-apify-isolation-plan.md §2.
 */
function fakeSharedAccountConnector(datasets: RemoteDataset[]): SourceConnector {
  return {
    kind: "manual",
    async listDatasets(): Promise<RemoteDataset[]> {
      return datasets;
    },
    async getDataset(externalId: string): Promise<RemoteDataset | null> {
      return datasets.find((d) => d.externalId === externalId) ?? null;
    },
    async fetchItems(): Promise<RemoteItemPage> {
      return { items: [], total: 0, offset: 0, limit: 0 };
    },
  };
}

async function seedCompanyWithSource(namePatterns: string[]) {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Discovery Test Co ${crypto.randomUUID()}`, slug: `discovery-test-${crypto.randomUUID()}` })
    .returning();
  const [source] = await db()
    .insert(schema.sources)
    .values({
      companyId: company.id,
      kind: "manual",
      name: `discovery-test-source-${crypto.randomUUID()}`,
      config: { namePatterns, producerIds: [], minItemCount: 0 },
    })
    .returning();
  return { companyId: company.id, sourceId: source.id };
}

describe("discoverAllSources — cross-company collision guard", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("does not let a second company register a dataset the first company already claimed", async () => {
    const sharedExternalId = `shared-ds-${crypto.randomUUID()}`;
    const remoteDataset: RemoteDataset = {
      externalId: sharedExternalId,
      name: "overlap-dataset",
      title: null,
      itemCount: 5,
      createdAt: new Date(),
      modifiedAt: new Date(),
      producerId: null,
      producerRunId: null,
    };
    // Both companies' filters match everything ("" is a substring of every
    // name) — the exact misconfiguration (or the "left empty" default) the
    // guard exists to catch even though namePatterns alone didn't stop it.
    registerConnector(fakeSharedAccountConnector([remoteDataset]));

    const companyA = await seedCompanyWithSource([""]);
    const companyB = await seedCompanyWithSource([""]);

    const resultsA = await discoverAllSources(companyA.companyId);
    expect(resultsA[0].added).toBe(1);
    expect(resultsA[0].collisions).toBe(0);

    const resultsB = await discoverAllSources(companyB.companyId);
    expect(resultsB[0].added).toBe(0);
    expect(resultsB[0].collisions).toBe(1);
    expect(resultsB[0].errors[0]).toMatch(/already belongs to another company/);

    // The dataset row exists exactly once, owned by company A — never
    // duplicated under company B.
    const rows = await db().select().from(schema.datasets).where(eq(schema.datasets.externalId, sharedExternalId));
    expect(rows).toHaveLength(1);
    expect(rows[0].companyId).toBe(companyA.companyId);

    const companyBRows = await db()
      .select()
      .from(schema.datasets)
      .where(and(eq(schema.datasets.externalId, sharedExternalId), eq(schema.datasets.companyId, companyB.companyId)));
    expect(companyBRows).toHaveLength(0);
  });

  it("registers independently-named datasets normally when there is no overlap", async () => {
    const companyA = await seedCompanyWithSource(["team-a-"]);
    const companyB = await seedCompanyWithSource(["team-b-"]);

    registerConnector(
      fakeSharedAccountConnector([
        {
          externalId: `a-${crypto.randomUUID()}`,
          name: "team-a-dataset",
          title: null,
          itemCount: 1,
          createdAt: new Date(),
          modifiedAt: new Date(),
          producerId: null,
          producerRunId: null,
        },
        {
          externalId: `b-${crypto.randomUUID()}`,
          name: "team-b-dataset",
          title: null,
          itemCount: 1,
          createdAt: new Date(),
          modifiedAt: new Date(),
          producerId: null,
          producerRunId: null,
        },
      ]),
    );

    const resultsA = await discoverAllSources(companyA.companyId);
    const resultsB = await discoverAllSources(companyB.companyId);

    expect(resultsA[0].added).toBe(1);
    expect(resultsA[0].collisions).toBe(0);
    expect(resultsB[0].added).toBe(1);
    expect(resultsB[0].collisions).toBe(0);
  });
});
