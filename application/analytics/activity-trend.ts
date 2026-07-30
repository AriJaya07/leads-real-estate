import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface ActivityTrendPoint {
  date: string;
  total: number;
  contacted: number;
  statusChanged: number;
  notesAdded: number;
}

/**
 * Daily team activity over time — the trend counterpart to
 * `team-activity.ts::getTeamActivityStats`'s single 7-day snapshot. Reads
 * `lead_events`, the same append-only ledger every other analytics/audit
 * feature in this app already reads; no new write path.
 */
export async function getActivityTrend(companyId: string, days = 30): Promise<ActivityTrendPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db()
    .select({
      date: sql<string>`to_char(date_trunc('day', ${schema.leadEvents.at}), 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      contacted: sql<number>`count(*) FILTER (WHERE ${schema.leadEvents.type} = 'contacted')::int`,
      statusChanged: sql<number>`count(*) FILTER (WHERE ${schema.leadEvents.type} = 'status_changed')::int`,
      notesAdded: sql<number>`count(*) FILTER (WHERE ${schema.leadEvents.type} = 'note_added')::int`,
    })
    .from(schema.leadEvents)
    .where(and(eq(schema.leadEvents.companyId, companyId), gte(schema.leadEvents.at, since)))
    .groupBy(sql`date_trunc('day', ${schema.leadEvents.at})`)
    .orderBy(sql`date_trunc('day', ${schema.leadEvents.at})`);

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: ActivityTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDate.get(date);
    series.push({
      date,
      total: row?.total ?? 0,
      contacted: row?.contacted ?? 0,
      statusChanged: row?.statusChanged ?? 0,
      notesAdded: row?.notesAdded ?? 0,
    });
  }
  return series;
}
