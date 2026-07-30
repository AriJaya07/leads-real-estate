import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface AgentPerformance {
  userId: string;
  name: string | null;
  leadCount: number;
  contactedCount: number;
  closedCount: number;
  closedRevenueUsd: number;
  /** Same `percentile_cont` formula `getLeadStats` uses for the company-wide figure, grouped per agent instead. */
  medianTimeToFirstTouchMinutes: number | null;
  /** `closedCount / leadCount` for leads assigned to this agent. */
  conversionPct: number;
}

/**
 * Per-agent workload and outcomes. `LEFT JOIN` from `users`, not `INNER
 * JOIN` — an agent with zero assigned leads still appears with all-zero
 * figures, which is itself useful information for a manager auditing
 * coverage (someone in the round-robin pool who's never actually gotten a
 * lead is a real finding, not noise to hide).
 */
export async function getAgentPerformance(companyId: string): Promise<AgentPerformance[]> {
  const rows = await db()
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      leadCount: sql<number>`count(${schema.leadStates.leadId})::int`,
      contactedCount: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.firstContactedAt} IS NOT NULL)::int`,
      closedCount: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.status} = 'closed')::int`,
      closedRevenueUsd: sql<number>`coalesce(sum(${schema.leadStates.dealValueUsd}) FILTER (WHERE ${schema.leadStates.status} = 'closed'), 0)::int`,
      medianTtft: sql<number | null>`
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (${schema.leadStates.firstContactedAt} - ${schema.leads.createdAt})) / 60
        ) FILTER (WHERE ${schema.leadStates.firstContactedAt} IS NOT NULL)
      `,
    })
    .from(schema.users)
    // The `companyId` condition on this join is defense-in-depth, not a
    // correctness fix for known-good data: `assignedTo` can only ever point
    // to a same-company user (`assignLead`'s own tenant check already
    // enforces that). Making it explicit here means this query still can't
    // leak across tenants even if that invariant were ever broken elsewhere
    // — see docs/tech-debt.md on why app-layer scoping is audited per-query.
    .leftJoin(
      schema.leadStates,
      and(eq(schema.leadStates.assignedTo, schema.users.id), eq(schema.leadStates.companyId, companyId)),
    )
    .leftJoin(schema.leads, eq(schema.leads.id, schema.leadStates.leadId))
    .where(eq(schema.users.companyId, companyId))
    .groupBy(schema.users.id, schema.users.name)
    .orderBy(desc(sql`count(${schema.leadStates.leadId})`));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    leadCount: row.leadCount,
    contactedCount: row.contactedCount,
    closedCount: row.closedCount,
    closedRevenueUsd: row.closedRevenueUsd,
    medianTimeToFirstTouchMinutes: row.medianTtft === null ? null : Math.round(Number(row.medianTtft)),
    conversionPct: row.leadCount === 0 ? 0 : (row.closedCount / row.leadCount) * 100,
  }));
}
