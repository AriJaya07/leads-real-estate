import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { leadsTag } from "@/application/cache-tags";

/** How far back "recent" activity looks for the dashboard's team activity tile. */
const ACTIVITY_WINDOW = sql`now() - interval '7 days'`;

export interface TeamActivityStats {
  totalAgents: number;
  /** Distinct teammates who logged at least one `lead_events` row in the window. */
  activeAgents: number;
  /** `contacted` events — the north-star action (see docs/architecture.md's time-to-first-touch). */
  contactedCount: number;
  eventsCount: number;
  topAgents: { userId: string; name: string | null; contactedCount: number }[];
}

/**
 * Team activity for the dashboard overview — sourced from `lead_events`
 * (`docs/domain.md`'s append-only audit trail), the same ledger
 * `markContacted`/`assignLead`/etc already write to. Nothing new to track:
 * this is a read over data the product was already recording.
 */
export async function getTeamActivityStats(companyId: string): Promise<TeamActivityStats> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const [totals] = await db()
    .select({ totalAgents: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(eq(schema.users.companyId, companyId));

  const [activity] = await db()
    .select({
      activeAgents: sql<number>`count(distinct ${schema.leadEvents.actorId})::int`,
      contactedCount: sql<number>`count(*) FILTER (WHERE ${schema.leadEvents.type} = 'contacted')::int`,
      eventsCount: sql<number>`count(*)::int`,
    })
    .from(schema.leadEvents)
    .where(
      and(
        eq(schema.leadEvents.companyId, companyId),
        sql`${schema.leadEvents.at} >= ${ACTIVITY_WINDOW}`,
        sql`${schema.leadEvents.actorId} IS NOT NULL`,
      ),
    );

  const topAgents = await db()
    .select({
      userId: schema.leadEvents.actorId,
      name: schema.users.name,
      contactedCount: sql<number>`count(*) FILTER (WHERE ${schema.leadEvents.type} = 'contacted')::int`,
    })
    .from(schema.leadEvents)
    .innerJoin(schema.users, eq(schema.users.id, schema.leadEvents.actorId))
    .where(and(eq(schema.leadEvents.companyId, companyId), sql`${schema.leadEvents.at} >= ${ACTIVITY_WINDOW}`))
    .groupBy(schema.leadEvents.actorId, schema.users.name)
    .orderBy(desc(sql`count(*) FILTER (WHERE ${schema.leadEvents.type} = 'contacted')`))
    .limit(5);

  return {
    totalAgents: totals?.totalAgents ?? 0,
    activeAgents: activity?.activeAgents ?? 0,
    contactedCount: activity?.contactedCount ?? 0,
    eventsCount: activity?.eventsCount ?? 0,
    topAgents: topAgents
      .filter((a): a is typeof a & { userId: string } => a.userId !== null)
      .map((a) => ({ userId: a.userId, name: a.name, contactedCount: a.contactedCount })),
  };
}
