import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { priorityScore } from "@/domain/lead/ranking";
import { leadsTag } from "@/application/cache-tags";
import type { LeadFilters } from "./filters.schema";
import { textArray, validLeadTypes, validStatuses, validRecordKinds } from "./sql-helpers";
import { prioritySortExpression } from "./priority-sql";
import type { ContactInfo, ScoreReason } from "@/domain/scoring/types";

/** A representative appearance for card/list display — a person has no single "body" anymore. */
export interface PrimaryAppearance {
  body: string;
  listingTitle: string | null;
  externalUrl: string | null;
  sourceGroup: string | null;
  postedAt: Date;
  images: string[];
  recordKind: string;
  scoreReasons: ScoreReason[];
}

export interface LeadListItem {
  id: string;
  facebookId: string | null;
  instagramId: string | null;
  profileUrl: string | null;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
  contact: ContactInfo;
  leadType: string;
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;
  aiExplanation: string;
  propertyTypes: string[];
  locations: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  latestAppearanceAt: Date | null;
  appearanceCount: number;
  primaryAppearance: PrimaryAppearance | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  bookmarked: boolean;
  notes: string;
  tags: string[];
  firstContactedAt: Date | null;
  priority: number;
}

/**
 * Appearance-scoped filters (`datasetId`, `groups`, `recordKind`, `attr`, and
 * the appearance half of `q`) become `EXISTS` subqueries against
 * `lead_appearances` rather than direct columns — a person isn't scoped to one
 * dataset/group/record-kind, they can have appearances across many.
 */
function buildConditions(filters: LeadFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.datasetId) {
    conditions.push(sql`
      EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.datasetId} = ${filters.datasetId})
    `);
  }

  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(schema.leads.name, term),
        ilike(schema.leads.username, term),
        ilike(schema.leads.bio, term),
        sql`EXISTS (SELECT 1 FROM ${schema.leadAppearances}
          WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
          AND (${schema.leadAppearances.body} ILIKE ${term}
               OR ${schema.leadAppearances.listingTitle} ILIKE ${term}
               OR ${schema.leadAppearances.sourceGroup} ILIKE ${term}))`,
      )!,
    );
  }

  // Unknown values are dropped rather than passed through: an enum column
  // rejects them outright, so a hand-edited query string would 500 the page.
  const leadTypes = validLeadTypes(filters.leadType);
  if (leadTypes.length) conditions.push(inArray(schema.leads.leadType, leadTypes));

  const statuses = validStatuses(filters.status);
  if (statuses.length) conditions.push(inArray(schema.leadStates.status, statuses));

  const recordKinds = validRecordKinds(filters.recordKind);
  if (recordKinds.length) {
    conditions.push(sql`
      EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.recordKind}::text = ANY(${textArray(recordKinds)}))
    `);
  }

  if (filters.groups.length) {
    conditions.push(sql`
      EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.sourceGroup} = ANY(${textArray(filters.groups)}))
    `);
  }

  if (filters.propertyTypes.length) {
    conditions.push(sql`${schema.leads.propertyTypes} && ${textArray(filters.propertyTypes)}`);
  }
  if (filters.locations.length) {
    conditions.push(sql`${schema.leads.locations} && ${textArray(filters.locations)}`);
  }

  if (filters.minBuyerScore !== undefined) {
    conditions.push(gte(schema.leads.buyerScore, filters.minBuyerScore));
  }
  if (filters.minConfidence !== undefined) {
    conditions.push(gte(schema.leads.confidenceScore, filters.minConfidence));
  }
  if (filters.budgetMin !== undefined) {
    conditions.push(gte(schema.leads.budgetUsdMax, filters.budgetMin));
  }
  if (filters.budgetMax !== undefined) {
    conditions.push(lte(schema.leads.budgetUsdMin, filters.budgetMax));
  }

  if (filters.hasContact) {
    conditions.push(
      sql`(${schema.leads.contact}->>'phone' IS NOT NULL OR ${schema.leads.contact}->>'whatsapp' IS NOT NULL OR ${schema.leads.contact}->>'email' IS NOT NULL)`,
    );
  }
  if (filters.assignedTo) conditions.push(eq(schema.leadStates.assignedTo, filters.assignedTo));
  if (filters.unassigned) conditions.push(isNull(schema.leadStates.assignedTo));

  if (filters.postedAfter) {
    const date = new Date(filters.postedAfter);
    if (!Number.isNaN(date.getTime())) conditions.push(gte(schema.leads.latestAppearanceAt, date));
  }
  if (filters.postedBefore) {
    const date = new Date(filters.postedBefore);
    if (!Number.isNaN(date.getTime())) conditions.push(lte(schema.leads.latestAppearanceAt, date));
  }

  // Dynamic attributes discovered in the payload, now appearance-scoped. Values
  // are bound as parameters, and the key is confined to a jsonb path — no SQL
  // is built from user strings.
  for (const [key, raw] of Object.entries(filters.attr)) {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    if (values.length === 0) continue;
    conditions.push(sql`
      EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.attributes}->>${key} = ANY(${textArray(values)}))
    `);
  }

  return conditions;
}

function orderBy(sort: LeadFilters["sort"]) {
  switch (sort) {
    case "newest":
      return [desc(schema.leads.latestAppearanceAt)];
    case "oldest":
      return [asc(schema.leads.latestAppearanceAt)];
    case "buyerScore":
      return [desc(schema.leads.buyerScore), desc(schema.leads.latestAppearanceAt)];
    case "confidence":
      return [desc(schema.leads.confidenceScore), desc(schema.leads.latestAppearanceAt)];
    case "priority":
    default:
      /**
       * Recency-decayed priority, computed in SQL so it can drive ORDER BY and
       * paginate correctly. The expression itself lives in `priority-sql.ts`,
       * built from the same constants `domain/lead/ranking.ts::priorityScore` uses.
       */
      return [desc(prioritySortExpression()), desc(schema.leads.latestAppearanceAt)];
  }
}

/**
 * A person has no single post — this picks one representative appearance per
 * lead (highest-scoring, most recent, excluding spam/duplicates) for card/list
 * display via `DISTINCT ON`. The full history is `getLeadAppearances`, used by
 * the detail sheet's "Sources" list.
 */
export function primaryAppearanceSubquery() {
  return db()
    .selectDistinctOn([schema.leadAppearances.leadId], {
      leadId: schema.leadAppearances.leadId,
      body: schema.leadAppearances.body,
      listingTitle: schema.leadAppearances.listingTitle,
      externalUrl: schema.leadAppearances.externalUrl,
      sourceGroup: schema.leadAppearances.sourceGroup,
      postedAt: schema.leadAppearances.postedAt,
      images: schema.leadAppearances.images,
      recordKind: schema.leadAppearances.recordKind,
      scoreReasons: schema.leadAppearances.scoreReasons,
    })
    .from(schema.leadAppearances)
    .where(and(eq(schema.leadAppearances.isSpam, false), isNull(schema.leadAppearances.canonicalAppearanceId)))
    .orderBy(
      schema.leadAppearances.leadId,
      desc(schema.leadAppearances.intentScore),
      desc(schema.leadAppearances.postedAt),
    )
    .as("primary_appearance");
}

export interface LeadPage {
  items: LeadListItem[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export async function queryLeads(filters: LeadFilters): Promise<LeadPage> {
  const conditions = buildConditions(filters);
  const where = conditions.length ? and(...conditions) : undefined;
  const primary = primaryAppearanceSubquery();

  const rows = await db()
    .select({
      id: schema.leads.id,
      facebookId: schema.leads.facebookId,
      instagramId: schema.leads.instagramId,
      profileUrl: schema.leads.profileUrl,
      username: schema.leads.username,
      name: schema.leads.name,
      avatarUrl: schema.leads.avatarUrl,
      location: schema.leads.location,
      bio: schema.leads.bio,
      contact: schema.leads.contact,
      leadType: schema.leads.leadType,
      buyerScore: schema.leads.buyerScore,
      sellerScore: schema.leads.sellerScore,
      investorScore: schema.leads.investorScore,
      confidenceScore: schema.leads.confidenceScore,
      aiExplanation: schema.leads.aiExplanation,
      propertyTypes: schema.leads.propertyTypes,
      locations: schema.leads.locations,
      budgetMin: schema.leads.budgetMin,
      budgetMax: schema.leads.budgetMax,
      budgetCurrency: schema.leads.budgetCurrency,
      latestAppearanceAt: schema.leads.latestAppearanceAt,
      appearanceCount: schema.leads.appearanceCount,
      primaryBody: primary.body,
      primaryListingTitle: primary.listingTitle,
      primaryExternalUrl: primary.externalUrl,
      primarySourceGroup: primary.sourceGroup,
      primaryPostedAt: primary.postedAt,
      primaryImages: primary.images,
      primaryRecordKind: primary.recordKind,
      primaryScoreReasons: primary.scoreReasons,
      status: schema.leadStates.status,
      assignedTo: schema.leadStates.assignedTo,
      assignedToName: schema.users.name,
      bookmarked: schema.leadStates.bookmarked,
      notes: schema.leadStates.notes,
      tags: schema.leadStates.tags,
      firstContactedAt: schema.leadStates.firstContactedAt,
    })
    .from(schema.leads)
    .leftJoin(schema.leadStates, eq(schema.leadStates.leadId, schema.leads.id))
    .leftJoin(schema.users, eq(schema.users.id, schema.leadStates.assignedTo))
    .leftJoin(primary, eq(primary.leadId, schema.leads.id))
    .where(where)
    .orderBy(...orderBy(filters.sort))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .leftJoin(schema.leadStates, eq(schema.leadStates.leadId, schema.leads.id))
    .where(where);

  const now = Date.now();
  const items: LeadListItem[] = rows.map((row) => ({
    ...row,
    status: row.status ?? "new",
    notes: row.notes ?? "",
    tags: row.tags ?? [],
    bookmarked: row.bookmarked ?? false,
    contact: row.contact ?? {},
    primaryAppearance: row.primaryPostedAt
      ? {
          body: row.primaryBody ?? "",
          listingTitle: row.primaryListingTitle,
          externalUrl: row.primaryExternalUrl,
          sourceGroup: row.primarySourceGroup,
          postedAt: row.primaryPostedAt,
          images: row.primaryImages ?? [],
          recordKind: row.primaryRecordKind ?? "content_post",
          scoreReasons: row.primaryScoreReasons ?? [],
        }
      : null,
    priority: priorityScore(
      {
        leadType: row.leadType,
        buyerScore: row.buyerScore,
        sellerScore: row.sellerScore,
        investorScore: row.investorScore,
        confidenceScore: row.confidenceScore,
        latestAppearanceAt: row.latestAppearanceAt,
        hasContact: Boolean(row.contact?.phone || row.contact?.whatsapp || row.contact?.email),
        status: row.status ?? "new",
      },
      now,
    ),
  }));

  return {
    items,
    total: count,
    totalPages: Math.max(1, Math.ceil(count / filters.pageSize)),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export interface AlertableLead {
  id: string;
  name: string | null;
  leadType: string;
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;
  propertyTypes: string[];
  locations: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetUsdMin: number | null;
  budgetUsdMax: number | null;
  budgetCurrency: string | null;
  contact: ContactInfo;
  latestAppearanceAt: Date | null;
  primaryAppearance: PrimaryAppearance | null;
}

/**
 * Fetches the person rows an alert batch needs to evaluate/render — the
 * predicate subject (`application/alerting/dispatch.ts::toSubject`) and the
 * digest email's "what to say/where to click" both come from this, not raw
 * `schema.leads` rows, since a person has no single body/link of their own.
 */
export async function getLeadsForDigest(leadIds: string[]): Promise<AlertableLead[]> {
  if (leadIds.length === 0) return [];
  const primary = primaryAppearanceSubquery();

  const rows = await db()
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      leadType: schema.leads.leadType,
      buyerScore: schema.leads.buyerScore,
      sellerScore: schema.leads.sellerScore,
      investorScore: schema.leads.investorScore,
      confidenceScore: schema.leads.confidenceScore,
      propertyTypes: schema.leads.propertyTypes,
      locations: schema.leads.locations,
      budgetMin: schema.leads.budgetMin,
      budgetMax: schema.leads.budgetMax,
      budgetUsdMin: schema.leads.budgetUsdMin,
      budgetUsdMax: schema.leads.budgetUsdMax,
      budgetCurrency: schema.leads.budgetCurrency,
      contact: schema.leads.contact,
      latestAppearanceAt: schema.leads.latestAppearanceAt,
      primaryBody: primary.body,
      primaryListingTitle: primary.listingTitle,
      primaryExternalUrl: primary.externalUrl,
      primarySourceGroup: primary.sourceGroup,
      primaryPostedAt: primary.postedAt,
      primaryImages: primary.images,
      primaryRecordKind: primary.recordKind,
      primaryScoreReasons: primary.scoreReasons,
    })
    .from(schema.leads)
    .leftJoin(primary, eq(primary.leadId, schema.leads.id))
    .where(inArray(schema.leads.id, leadIds));

  return rows.map((row) => ({
    ...row,
    contact: row.contact ?? {},
    primaryAppearance: row.primaryPostedAt
      ? {
          body: row.primaryBody ?? "",
          listingTitle: row.primaryListingTitle,
          externalUrl: row.primaryExternalUrl,
          sourceGroup: row.primarySourceGroup,
          postedAt: row.primaryPostedAt,
          images: row.primaryImages ?? [],
          recordKind: row.primaryRecordKind ?? "content_post",
          scoreReasons: row.primaryScoreReasons ?? [],
        }
      : null,
  }));
}

export interface LeadAppearanceListItem {
  id: string;
  recordKind: string;
  platform: string;
  sourceGroup: string | null;
  externalUrl: string | null;
  body: string;
  listingTitle: string | null;
  postedAt: Date;
  intent: string;
  intentScore: number;
  scoreReasons: ScoreReason[];
  attributes: Record<string, unknown>;
  duplicateCount: number;
}

/**
 * Every source a lead was collected from — backs the detail sheet's "Sources"
 * list, the concrete answer to "track every source where the lead was
 * collected." Excludes spam; includes near-duplicate reposts collapsed under
 * their canonical appearance (via `duplicateCount`), same UI pattern the old
 * per-post inbox used, just scoped per-person now instead of globally.
 */
export async function getLeadAppearances(leadId: string): Promise<LeadAppearanceListItem[]> {
  const duplicateCount = sql<number>`(
    SELECT count(*)::int FROM ${schema.leadAppearances} AS dup
    WHERE dup.canonical_appearance_id = ${schema.leadAppearances.id}
  )`;

  const rows = await db()
    .select({
      id: schema.leadAppearances.id,
      recordKind: schema.leadAppearances.recordKind,
      platform: schema.leadAppearances.platform,
      sourceGroup: schema.leadAppearances.sourceGroup,
      externalUrl: schema.leadAppearances.externalUrl,
      body: schema.leadAppearances.body,
      listingTitle: schema.leadAppearances.listingTitle,
      postedAt: schema.leadAppearances.postedAt,
      intent: schema.leadAppearances.intent,
      intentScore: schema.leadAppearances.intentScore,
      scoreReasons: schema.leadAppearances.scoreReasons,
      attributes: schema.leadAppearances.attributes,
      duplicateCount,
    })
    .from(schema.leadAppearances)
    .where(
      and(
        eq(schema.leadAppearances.leadId, leadId),
        eq(schema.leadAppearances.isSpam, false),
        isNull(schema.leadAppearances.canonicalAppearanceId),
      ),
    )
    .orderBy(desc(schema.leadAppearances.postedAt));

  return rows;
}

export interface LeadStats {
  total: number;
  buyers: number;
  hotBuyers: number;
  unassigned: number;
  newLast24h: number;
  contactable: number;
  medianTimeToFirstTouchMinutes: number | null;
}

/**
 * Headline numbers for the inbox — now counting people, not appearances. A
 * person seen in 5 groups is 1 lead, not 5, directly reflecting "each person
 * should exist only once."
 *
 * `medianTimeToFirstTouch` is the north-star metric — everything else is
 * context for it. Base is `leads.createdAt` (when this person first became a
 * lead), not any single appearance's `postedAt` — there's no one "the" post
 * anymore, and "how long from when we identified them to first contact" is
 * arguably the more correct read of the metric than before.
 *
 * Cached (unlike `queryLeads`): keyed only on `datasetId`, so the cache key
 * space is bounded (one entry per dataset + "all"), versus the list's
 * unbounded filter/search/sort/page combinations where a cache would rarely
 * hit. `leadsTag()` is invalidated immediately by every lead mutation
 * (`lead.actions.ts`) and in the background by every sync.
 */
export async function getLeadStats(datasetId?: string): Promise<LeadStats> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const scope = datasetId
    ? sql`EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.datasetId} = ${datasetId})`
    : undefined;

  const [row] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) FILTER (WHERE ${schema.leads.leadType} = 'buyer')::int`,
      hotBuyers: sql<number>`count(*) FILTER (WHERE ${schema.leads.leadType} = 'buyer' AND ${schema.leads.buyerScore} >= 60)::int`,
      unassigned: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.assignedTo} IS NULL)::int`,
      newLast24h: sql<number>`count(*) FILTER (WHERE ${schema.leads.createdAt} > now() - interval '24 hours')::int`,
      contactable: sql<number>`count(*) FILTER (WHERE ${schema.leads.contact}->>'whatsapp' IS NOT NULL OR ${schema.leads.contact}->>'phone' IS NOT NULL)::int`,
      medianTtft: sql<number | null>`
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (${schema.leadStates.firstContactedAt} - ${schema.leads.createdAt})) / 60
        ) FILTER (WHERE ${schema.leadStates.firstContactedAt} IS NOT NULL)
      `,
    })
    .from(schema.leads)
    .leftJoin(schema.leadStates, eq(schema.leadStates.leadId, schema.leads.id))
    .where(scope);

  return {
    total: row.total,
    buyers: row.buyers,
    hotBuyers: row.hotBuyers,
    unassigned: row.unassigned,
    newLast24h: row.newLast24h,
    contactable: row.contactable,
    medianTimeToFirstTouchMinutes:
      row.medianTtft === null ? null : Math.round(Number(row.medianTtft)),
  };
}

export interface LeadTrendPoint {
  date: string;
  total: number;
  buyers: number;
}

/**
 * New unique leads per day for the Intelligence page's trend chart — grouped
 * on `leads.createdAt` (when a person was first identified), not appearance
 * volume. This is a genuinely different, arguably more useful metric than the
 * old per-post version: "how many new people did we find," not "how much
 * scraping happened." Gap-filled in the loop below rather than in SQL — a day
 * with zero new leads shouldn't need a `generate_series` join for what's a
 * 30-element array either way.
 */
export async function getLeadTrend(datasetId?: string, days = 30): Promise<LeadTrendPoint[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = datasetId
    ? sql`EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.datasetId} = ${datasetId})`
    : undefined;

  const rows = await db()
    .select({
      date: sql<string>`to_char(date_trunc('day', ${schema.leads.createdAt}), 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) FILTER (WHERE ${schema.leads.leadType} = 'buyer')::int`,
    })
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, since), scope))
    .groupBy(sql`date_trunc('day', ${schema.leads.createdAt})`)
    .orderBy(sql`date_trunc('day', ${schema.leads.createdAt})`);

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: LeadTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = byDate.get(date);
    series.push({ date, total: row?.total ?? 0, buyers: row?.buyers ?? 0 });
  }
  return series;
}

export interface BudgetStats {
  withBudget: number;
  medianUsd: number | null;
  minUsd: number | null;
  maxUsd: number | null;
}

/** Budget signal across active leads — USD-normalized, same fields `queryLeads` filters on. */
export async function getBudgetStats(datasetId?: string): Promise<BudgetStats> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const scope = datasetId
    ? sql`EXISTS (SELECT 1 FROM ${schema.leadAppearances}
        WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
        AND ${schema.leadAppearances.datasetId} = ${datasetId})`
    : undefined;
  const stated = sql`coalesce(${schema.leads.budgetUsdMax}, ${schema.leads.budgetUsdMin})`;

  const [row] = await db()
    .select({
      withBudget: sql<number>`count(*) FILTER (WHERE ${stated} IS NOT NULL)::int`,
      medianUsd: sql<number | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${stated})`,
      minUsd: sql<number | null>`min(${schema.leads.budgetUsdMin})`,
      maxUsd: sql<number | null>`max(${schema.leads.budgetUsdMax})`,
    })
    .from(schema.leads)
    .where(scope);

  return {
    withBudget: row.withBudget,
    medianUsd: row.medianUsd === null ? null : Math.round(Number(row.medianUsd)),
    minUsd: row.minUsd === null ? null : Math.round(Number(row.minUsd)),
    maxUsd: row.maxUsd === null ? null : Math.round(Number(row.maxUsd)),
  };
}
