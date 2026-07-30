import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { PIPELINE_STATUSES } from "@/application/leads/lead-status";

export interface FunnelStage {
  status: string;
  /** Leads that have EVER reached at least this stage — a cohort count, not "currently sitting at this stage." */
  count: number;
  /** `count / total` — how much of the whole lead base ever got this far. */
  ofTotalPct: number;
  /** `count / previous stage's count` — the actual stage-to-stage drop-off rate. `null` for the first stage. */
  conversionFromPreviousPct: number | null;
}

export interface ConversionFunnel {
  total: number;
  stages: FunnelStage[];
  /** Leads currently marked `rejected` — reported alongside the funnel, not subtracted from it: a lead rejected after reaching `negotiation` still counts toward every stage up to and including `negotiation`. */
  rejected: number;
  /** `stages[last].count / total` — the headline "what fraction of leads ever close" number. */
  overallConversionPct: number;
}

/** `CASE payload->>'status' WHEN 'new' THEN 0 ... END` — maps a status_changed event's status onto its position in `PIPELINE_STATUSES`. `rejected` (not part of the sequence) falls through to NULL, which `MAX()` ignores rather than treating as 0. */
const STAGE_INDEX_CASE = sql`CASE ${schema.leadEvents.payload}->>'status' ${sql.join(
  PIPELINE_STATUSES.map((status, index) => sql`WHEN ${status} THEN ${index}`),
  sql` `,
)} ELSE NULL END`;

/**
 * A cohort funnel, not a point-in-time snapshot: each stage's count is "how
 * many leads have EVER reached at least this far," computed from the
 * `status_changed` events every `setLeadStatus` call already writes — not
 * "how many leads currently sit at this status." The naive version (grouping
 * on current status) would conflate different leads' progress at different
 * times and silently drop anyone who moved past a stage — the exact
 * inaccuracy "ensure all calculations are accurate" rules out.
 *
 * Every lead has implicitly reached `PIPELINE_STATUSES[0]` ("new") — that's
 * the state before any `setLeadStatus` call, so it needs no event to prove.
 * Company-wide only (no per-dataset scoping): a lead isn't scoped to one
 * dataset, and the per-source breakdown in `source-performance.ts` already
 * answers "which source" more precisely than a whole-page filter would.
 *
 * Deliberately uncached, unlike `getLeadStats`/`getLeadTrend` — same
 * reasoning `lead-queries.ts` gives for why `queryLeads` itself stays
 * uncached: this is revenue/conversion data, the surface where staleness
 * ("did that deal I just closed actually count?") is worse than an extra
 * query on an admin page that isn't loaded on every navigation the way the
 * inbox is.
 */
export async function getConversionFunnel(companyId: string): Promise<ConversionFunnel> {
  const [totalRow] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(eq(schema.leads.companyId, companyId));
  const total = totalRow?.total ?? 0;

  const [rejectedRow] = await db()
    .select({ rejected: sql<number>`count(*)::int` })
    .from(schema.leadStates)
    .where(and(eq(schema.leadStates.companyId, companyId), eq(schema.leadStates.status, "rejected")));
  const rejected = rejectedRow?.rejected ?? 0;

  const maxReachedRows = await db()
    .select({ leadId: schema.leadEvents.leadId, maxIndex: sql<number | null>`max(${STAGE_INDEX_CASE})` })
    .from(schema.leadEvents)
    .where(and(eq(schema.leadEvents.companyId, companyId), eq(schema.leadEvents.type, "status_changed")))
    .groupBy(schema.leadEvents.leadId);

  const reachedCounts = new Array<number>(PIPELINE_STATUSES.length).fill(0);
  reachedCounts[0] = total; // everyone has reached at least "new"
  for (const row of maxReachedRows) {
    if (row.maxIndex === null) continue;
    for (let i = 1; i <= row.maxIndex && i < reachedCounts.length; i += 1) {
      reachedCounts[i] += 1;
    }
  }

  let previous: number | null = null;
  const stages: FunnelStage[] = PIPELINE_STATUSES.map((status, index) => {
    const count = reachedCounts[index];
    const stage: FunnelStage = {
      status,
      count,
      ofTotalPct: total === 0 ? 0 : (count / total) * 100,
      conversionFromPreviousPct: previous === null ? null : previous === 0 ? 0 : (count / previous) * 100,
    };
    previous = count;
    return stage;
  });

  return {
    total,
    stages,
    rejected,
    overallConversionPct: total === 0 ? 0 : (reachedCounts[reachedCounts.length - 1] / total) * 100,
  };
}
