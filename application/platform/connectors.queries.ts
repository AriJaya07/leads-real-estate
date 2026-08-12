import "server-only";
import { and, desc, ne, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface ConnectorHealthOverview {
  byHealth: { health: string; count: number }[];
  /** Every non-healthy, non-archived dataset across every tenant — metadata only (name, health, company), never the records/leads inside it. */
  problemDatasets: {
    id: string;
    name: string;
    companyName: string;
    companySlug: string;
    health: string;
    lastSyncedAt: Date | null;
  }[];
}

/**
 * Cross-tenant sync/schema health — the "is a source about to silently stop
 * producing leads for someone" view. Same boundary as the rest of
 * `application/platform/`: dataset metadata and health status only, never
 * `raw_records`/`lead_appearances` content.
 */
export async function getConnectorHealthOverview(): Promise<ConnectorHealthOverview> {
  const [byHealth, problemRows] = await Promise.all([
    db()
      .select({ health: schema.datasets.health, count: sql<number>`count(*)::int` })
      .from(schema.datasets)
      .where(ne(schema.datasets.status, "archived"))
      .groupBy(schema.datasets.health),
    db()
      .select({
        id: schema.datasets.id,
        name: schema.datasets.name,
        title: schema.datasets.title,
        companyName: schema.companies.name,
        companySlug: schema.companies.slug,
        health: schema.datasets.health,
        lastSyncedAt: schema.datasets.lastSyncedAt,
      })
      .from(schema.datasets)
      .innerJoin(schema.companies, sql`${schema.companies.id} = ${schema.datasets.companyId}`)
      .where(and(ne(schema.datasets.status, "archived"), ne(schema.datasets.health, "healthy"), ne(schema.datasets.health, "unknown")))
      .orderBy(desc(schema.datasets.lastSyncedAt)),
  ]);

  return {
    byHealth,
    problemDatasets: problemRows.map((r) => ({
      id: r.id,
      name: r.title ?? r.name ?? "Unnamed dataset",
      companyName: r.companyName,
      companySlug: r.companySlug,
      health: r.health,
      lastSyncedAt: r.lastSyncedAt,
    })),
  };
}
