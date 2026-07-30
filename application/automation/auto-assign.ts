import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { TERMINAL_STATUSES } from "@/application/leads/lead-status";
import { textArray } from "@/application/leads/sql-helpers";
import { createLogger } from "@/infrastructure/observability/logger";
import { getAutomationSettings } from "./automation-settings.queries";

const log = createLogger("automation:auto-assign");

/** Leads in these statuses don't count toward anyone's workload and aren't auto-assigned. */
const INACTIVE_STATUSES = ["closed", ...TERMINAL_STATUSES] as const;

/** Safety cap per sweep — a company that just enabled this on a large unassigned backlog gets it worked down over several ticks, not dumped in one query. */
const MAX_PER_SWEEP = 200;

export interface AutoAssignResult {
  assigned: number;
}

/**
 * Round-robins currently-unassigned, active-pipeline leads across the
 * company's users — picking whoever currently has the fewest active leads
 * each time, so it self-balances even run at irregular intervals rather than
 * strictly alternating. A no-op if `autoAssignEnabled` is off or the company
 * has no users. Guards against racing a human's manual assignment: the
 * conditional `ON CONFLICT ... WHERE assigned_to IS NULL` only takes effect
 * if nobody claimed the lead between the read and the write.
 */
export async function runAutoAssignment(companyId: string): Promise<AutoAssignResult> {
  const settings = await getAutomationSettings(companyId);
  if (!settings.autoAssignEnabled) return { assigned: 0 };

  // `acceptsAssignments` already existed on `users` — provisioned for exactly
  // this feature ("Agents opted out of the round-robin get no new
  // assignments", per its schema comment) but unwired until now.
  const members = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.companyId, companyId), eq(schema.users.acceptsAssignments, true)));
  if (members.length === 0) return { assigned: 0 };

  const loadRows = await db()
    .select({ assignedTo: schema.leadStates.assignedTo, count: sql<number>`count(*)::int` })
    .from(schema.leadStates)
    .where(
      and(
        eq(schema.leadStates.companyId, companyId),
        sql`${schema.leadStates.assignedTo} IS NOT NULL`,
        sql`coalesce(${schema.leadStates.status}::text, 'new') != ALL(${textArray([...INACTIVE_STATUSES])})`,
      ),
    )
    .groupBy(schema.leadStates.assignedTo);

  const load = new Map<string, number>(members.map((m) => [m.id, 0]));
  for (const row of loadRows) {
    if (row.assignedTo) load.set(row.assignedTo, row.count);
  }

  const unassigned = await db()
    .select({ leadId: schema.leads.id })
    .from(schema.leads)
    .leftJoin(schema.leadStates, eq(schema.leadStates.leadId, schema.leads.id))
    .where(
      and(
        eq(schema.leads.companyId, companyId),
        sql`${schema.leadStates.assignedTo} IS NULL`,
        sql`coalesce(${schema.leadStates.status}::text, 'new') != ALL(${textArray([...INACTIVE_STATUSES])})`,
      ),
    )
    .orderBy(schema.leads.createdAt)
    .limit(MAX_PER_SWEEP);

  let assigned = 0;
  for (const lead of unassigned) {
    let pick = members[0].id;
    let min = Infinity;
    for (const member of members) {
      const current = load.get(member.id) ?? 0;
      if (current < min) {
        min = current;
        pick = member.id;
      }
    }

    const [updated] = await db()
      .insert(schema.leadStates)
      .values({ leadId: lead.leadId, companyId, assignedTo: pick })
      .onConflictDoUpdate({
        target: schema.leadStates.leadId,
        set: { assignedTo: pick, updatedAt: new Date() },
        where: sql`${schema.leadStates.assignedTo} IS NULL`,
      })
      .returning({ leadId: schema.leadStates.leadId });

    if (!updated) continue; // a human claimed it between our read and this write

    await db()
      .insert(schema.leadEvents)
      .values({ companyId, leadId: lead.leadId, type: "assigned", payload: { assignedTo: pick, auto: true } });

    load.set(pick, (load.get(pick) ?? 0) + 1);
    assigned += 1;
  }

  if (assigned > 0) log.info("auto-assigned leads", { companyId, assigned, candidates: unassigned.length });
  return { assigned };
}
