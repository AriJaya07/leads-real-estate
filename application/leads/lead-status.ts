import { leadStatusEnum } from "@/infrastructure/db/schema/enums";
import type { LeadStatusValue } from "./sql-helpers";

/**
 * Canonical status list, derived from the DB enum rather than hand-duplicated —
 * this and `LeadStatusValue` (sql-helpers.ts) are the two places that read the
 * enum directly; everywhere else (lead.actions.ts's `z.enum`, the lead detail
 * sheet's status buttons, the pipeline board's columns) imports from here.
 */
export const LEAD_STATUSES = leadStatusEnum.enumValues;

/** Kanban column order — the happy path, left to right. */
export const PIPELINE_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "viewing_booked",
  "converted",
] as const satisfies readonly LeadStatusValue[];

/** Terminal side-states: not part of the left-to-right flow, shown separately. */
export const TERMINAL_STATUSES = ["lost", "archived", "spam"] as const satisfies readonly LeadStatusValue[];

export function leadStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
