import { z } from "zod";

/**
 * Filter contract.
 *
 * The named fields are the canonical spine — the things alerting and scoring
 * must be able to mean something specific about. Everything discovered in the
 * data flows through `attr`, an open map validated by shape rather than by a
 * hardcoded list of keys, which is what lets a brand-new upstream field become a
 * working filter with no code change.
 *
 * Several fields here are appearance-level concepts (`recordKind`, `groups`,
 * `datasetId`, `attr`) even though a "lead" is now a person, not a post — they
 * filter "has a matching appearance" via an `EXISTS` subquery against
 * `lead_appearances` in `lead-queries.ts::buildConditions`, not a direct column
 * on `leads`. `propertyTypes`/`locations`/budget/etc are genuine person-level
 * rollup columns and filter directly.
 */
const leadSortEnum = z.enum(["priority", "newest", "oldest", "buyerScore", "confidence"]);

const leadViewEnum = z.enum(["table", "cards"]);

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [] as string[];
    const list = Array.isArray(value) ? value : value.split(",");
    return list.map((v) => v.trim()).filter(Boolean);
  });

const leadFiltersSchema = z.object({
  q: z.string().trim().default(""),
  datasetId: z.string().uuid().optional(),
  leadType: csv,
  status: csv,
  recordKind: csv,
  propertyTypes: csv,
  locations: csv,
  groups: csv,

  minBuyerScore: z.coerce.number().int().min(0).max(100).optional(),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  budgetMin: z.coerce.number().nonnegative().optional(),
  budgetMax: z.coerce.number().nonnegative().optional(),

  hasContact: z.coerce.boolean().optional(),
  assignedTo: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),

  /** Filters on `leads.latestAppearanceAt` — when this person was last active. */
  postedAfter: z.string().optional(),
  postedBefore: z.string().optional(),

  /** Dynamic, appearance-derived filters: `attr.paidPartnership=true`. */
  attr: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),

  sort: leadSortEnum.default("priority"),
  view: leadViewEnum.default("table"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const DEFAULT_FILTERS: LeadFilters = leadFiltersSchema.parse({});

/**
 * The one parser every entry point into the lead-filtering system shares —
 * the leads page's initial server render, the `/api/leads*` route handlers a
 * client re-fetch hits, and the client-side query hooks that build the fetch
 * URL from the same `URLSearchParams`. One implementation means a new filter
 * field, or a change to how `attr.*` is lifted, can't drift between the
 * server-rendered first paint and the client-driven re-fetches.
 */
export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const attr: Record<string, string | string[]> = {};
  const rest: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    const value = values.length > 1 ? values : values[0];
    if (key.startsWith("attr.")) attr[key.slice(5)] = value;
    else rest[key] = value;
  }

  return leadFiltersSchema.parse({ ...rest, attr });
}

/**
 * Triage default: new, unworked, buyer-type, recent. The default view is the
 * product — an agent opening the app should already be looking at who to call.
 */
export function triageFilters(): Partial<LeadFilters> {
  return { leadType: ["buyer"], status: ["new"], sort: "priority" };
}

/**
 * `parseLeadFilters`'s inverse — turns a parsed `LeadFilters` back into the
 * `URLSearchParams` the client-side query hooks fetch with
 * (`features/leads/queries.ts`). Only emits a param when it differs from the
 * schema's own default, so a filter reset back to default doesn't leave a
 * redundant `sort=priority` etc. in the query string. Covered by a round-trip
 * test (`parseLeadFilters(serializeLeadFilters(f))` reproduces `f`) — the pair
 * only stays correct if it's kept in sync as a unit, not by re-deriving one
 * from memory when the other changes.
 */
export function serializeLeadFilters(filters: LeadFilters): URLSearchParams {
  const params = new URLSearchParams();

  const put = (key: string, value: string | number | boolean | string[] | undefined) => {
    if (value === undefined || value === "" || value === null) return;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
      return;
    }
    if (typeof value === "boolean") {
      if (value) params.set(key, "true");
      return;
    }
    params.set(key, String(value));
  };

  put("q", filters.q || undefined);
  put("datasetId", filters.datasetId);
  put("leadType", filters.leadType);
  put("status", filters.status);
  put("recordKind", filters.recordKind);
  put("propertyTypes", filters.propertyTypes);
  put("locations", filters.locations);
  put("groups", filters.groups);
  put("minBuyerScore", filters.minBuyerScore);
  put("minConfidence", filters.minConfidence);
  put("budgetMin", filters.budgetMin);
  put("budgetMax", filters.budgetMax);
  put("hasContact", filters.hasContact);
  put("assignedTo", filters.assignedTo);
  put("unassigned", filters.unassigned);
  put("postedAfter", filters.postedAfter);
  put("postedBefore", filters.postedBefore);
  put("sort", filters.sort === DEFAULT_FILTERS.sort ? undefined : filters.sort);
  put("view", filters.view === DEFAULT_FILTERS.view ? undefined : filters.view);
  put("page", filters.page === DEFAULT_FILTERS.page ? undefined : filters.page);
  put("pageSize", filters.pageSize === DEFAULT_FILTERS.pageSize ? undefined : filters.pageSize);

  for (const [key, value] of Object.entries(filters.attr)) {
    put(`attr.${key}`, value);
  }

  return params;
}
