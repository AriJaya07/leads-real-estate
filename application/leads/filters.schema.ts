import { z } from "zod";

/**
 * Filter contract.
 *
 * The named fields are the canonical spine — the things alerting and scoring
 * must be able to mean something specific about. Everything discovered in the
 * data flows through `attr`, an open map validated by shape rather than by a
 * hardcoded list of keys, which is what lets a brand-new upstream field become a
 * working filter with no code change.
 */
export const leadSortEnum = z.enum([
  "priority",
  "newest",
  "intent",
  "quality",
  "reach",
  "oldest",
]);
export type LeadSort = z.infer<typeof leadSortEnum>;

export const leadViewEnum = z.enum(["table", "cards"]);

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [] as string[];
    const list = Array.isArray(value) ? value : value.split(",");
    return list.map((v) => v.trim()).filter(Boolean);
  });

export const leadFiltersSchema = z.object({
  q: z.string().trim().default(""),
  datasetId: z.string().uuid().optional(),
  intent: csv,
  status: csv,
  propertyTypes: csv,
  locations: csv,
  groups: csv,

  minIntent: z.coerce.number().int().min(0).max(100).optional(),
  minQuality: z.coerce.number().int().min(0).max(100).optional(),
  budgetMin: z.coerce.number().nonnegative().optional(),
  budgetMax: z.coerce.number().nonnegative().optional(),

  hasContact: z.coerce.boolean().optional(),
  assignedTo: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
  includeSpam: z.coerce.boolean().default(false),
  includeDuplicates: z.coerce.boolean().default(false),

  postedAfter: z.string().optional(),
  postedBefore: z.string().optional(),

  /** Dynamic, dataset-derived filters: `attr.paidPartnership=true`. */
  attr: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),

  sort: leadSortEnum.default("priority"),
  view: leadViewEnum.default("table"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const DEFAULT_FILTERS: LeadFilters = leadFiltersSchema.parse({});

/**
 * Triage default: new, unworked, buyer-intent, recent. The default view is the
 * product — an agent opening the app should already be looking at who to call.
 */
export function triageFilters(): Partial<LeadFilters> {
  return { intent: ["buyer"], status: ["new"], sort: "priority" };
}
