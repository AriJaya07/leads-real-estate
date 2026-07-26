import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { priorityScore } from "@/domain/lead/ranking";
import { leadsTag } from "@/application/cache-tags";
import type { LeadFilters } from "./filters.schema";
import { textArray, validIntents, validRecordKinds, validStatuses } from "./sql-helpers";
import { prioritySortExpression } from "./priority-sql";
import type { ContactInfo, ScoreReason } from "@/domain/scoring/types";

export interface LeadListItem {
  id: string;
  externalUrl: string | null;
  sourceGroup: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  listingTitle: string | null;
  images: string[];
  postedAt: Date;
  intent: string;
  recordKind: string;
  intentScore: number;
  qualityScore: number;
  reach: number;
  scoreReasons: ScoreReason[];
  propertyTypes: string[];
  locations: string[];
  bedrooms: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  contact: ContactInfo;
  attributes: Record<string, unknown>;
  isSpam: boolean;
  datasetId: string;
  duplicateCount: number;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  bookmarked: boolean;
  notes: string;
  tags: string[];
  firstContactedAt: Date | null;
  priority: number;
}

function buildConditions(filters: LeadFilters): SQL[] {
  const conditions: SQL[] = [];

  if (!filters.includeSpam) conditions.push(eq(schema.leads.isSpam, false));
  // Duplicates are linked rather than deleted, so they are hidden by default and
  // surfaced as a count on the surviving lead.
  if (!filters.includeDuplicates) conditions.push(isNull(schema.leads.canonicalLeadId));

  if (filters.datasetId) conditions.push(eq(schema.leads.datasetId, filters.datasetId));

  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(schema.leads.body, term),
        ilike(schema.leads.authorName, term),
        ilike(schema.leads.listingTitle, term),
        ilike(schema.leads.sourceGroup, term),
      )!,
    );
  }

  // Unknown values are dropped rather than passed through: an enum column
  // rejects them outright, so a hand-edited query string would 500 the page.
  const intents = validIntents(filters.intent);
  if (intents.length) conditions.push(inArray(schema.leads.intent, intents));

  const recordKinds = validRecordKinds(filters.recordKind);
  if (recordKinds.length) conditions.push(inArray(schema.leads.recordKind, recordKinds));

  const statuses = validStatuses(filters.status);
  if (statuses.length) conditions.push(inArray(schema.leadStates.status, statuses));

  if (filters.propertyTypes.length) {
    conditions.push(sql`${schema.leads.propertyTypes} && ${textArray(filters.propertyTypes)}`);
  }
  if (filters.locations.length) {
    conditions.push(sql`${schema.leads.locations} && ${textArray(filters.locations)}`);
  }
  if (filters.groups.length) {
    conditions.push(inArray(schema.leads.sourceGroup, filters.groups));
  }

  if (filters.minIntent !== undefined) {
    conditions.push(gte(schema.leads.intentScore, filters.minIntent));
  }
  if (filters.minQuality !== undefined) {
    conditions.push(gte(schema.leads.qualityScore, filters.minQuality));
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
    if (!Number.isNaN(date.getTime())) conditions.push(gte(schema.leads.postedAt, date));
  }
  if (filters.postedBefore) {
    const date = new Date(filters.postedBefore);
    if (!Number.isNaN(date.getTime())) conditions.push(lte(schema.leads.postedAt, date));
  }

  // Dynamic attributes discovered in the payload. Values are bound as parameters,
  // and the key is confined to a jsonb path — no SQL is built from user strings.
  for (const [key, raw] of Object.entries(filters.attr)) {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    if (values.length === 0) continue;
    conditions.push(sql`${schema.leads.attributes}->>${key} = ANY(${textArray(values)})`);
  }

  return conditions;
}

function orderBy(sort: LeadFilters["sort"]) {
  switch (sort) {
    case "newest":
      return [desc(schema.leads.postedAt)];
    case "oldest":
      return [asc(schema.leads.postedAt)];
    case "intent":
      return [desc(schema.leads.intentScore), desc(schema.leads.postedAt)];
    case "quality":
      return [desc(schema.leads.qualityScore), desc(schema.leads.postedAt)];
    case "reach":
      return [desc(schema.leads.reach), desc(schema.leads.postedAt)];
    case "priority":
    default:
      /**
       * Recency-decayed priority, computed in SQL so it can drive ORDER BY and
       * paginate correctly. A 95-score post from three days ago has already had
       * a dozen replies; an 80-score post from ten minutes ago is still winnable.
       * The expression itself lives in `priority-sql.ts`, built from the same
       * constants `domain/lead/ranking.ts::priorityScore` uses for display.
       */
      return [desc(prioritySortExpression()), desc(schema.leads.postedAt)];
  }
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

  const duplicateCount = sql<number>`(
    SELECT count(*)::int FROM ${schema.leads} AS dup
    WHERE dup.canonical_lead_id = ${schema.leads.id}
  )`;

  const rows = await db()
    .select({
      id: schema.leads.id,
      externalUrl: schema.leads.externalUrl,
      sourceGroup: schema.leads.sourceGroup,
      authorName: schema.leads.authorName,
      authorAvatarUrl: schema.leads.authorAvatarUrl,
      body: schema.leads.body,
      listingTitle: schema.leads.listingTitle,
      images: schema.leads.images,
      postedAt: schema.leads.postedAt,
      intent: schema.leads.intent,
      recordKind: schema.leads.recordKind,
      intentScore: schema.leads.intentScore,
      qualityScore: schema.leads.qualityScore,
      reach: schema.leads.reach,
      scoreReasons: schema.leads.scoreReasons,
      propertyTypes: schema.leads.propertyTypes,
      locations: schema.leads.locations,
      bedrooms: schema.leads.bedrooms,
      budgetMin: schema.leads.budgetMin,
      budgetMax: schema.leads.budgetMax,
      budgetCurrency: schema.leads.budgetCurrency,
      contact: schema.leads.contact,
      attributes: schema.leads.attributes,
      isSpam: schema.leads.isSpam,
      datasetId: schema.leads.datasetId,
      duplicateCount,
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
    priority: priorityScore(
      {
        intent: row.intent,
        intentScore: row.intentScore,
        qualityScore: row.qualityScore,
        postedAt: row.postedAt,
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
 * Headline numbers for the inbox. `medianTimeToFirstTouch` is the north-star
 * metric — everything else is context for it.
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

  const scope = datasetId ? eq(schema.leads.datasetId, datasetId) : undefined;
  const base = and(eq(schema.leads.isSpam, false), isNull(schema.leads.canonicalLeadId), scope);

  const [row] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) FILTER (WHERE ${schema.leads.intent} = 'buyer')::int`,
      hotBuyers: sql<number>`count(*) FILTER (WHERE ${schema.leads.intent} = 'buyer' AND ${schema.leads.intentScore} >= 60)::int`,
      unassigned: sql<number>`count(*) FILTER (WHERE ${schema.leadStates.assignedTo} IS NULL)::int`,
      newLast24h: sql<number>`count(*) FILTER (WHERE ${schema.leads.postedAt} > now() - interval '24 hours')::int`,
      contactable: sql<number>`count(*) FILTER (WHERE ${schema.leads.contact}->>'whatsapp' IS NOT NULL OR ${schema.leads.contact}->>'phone' IS NOT NULL)::int`,
      medianTtft: sql<number | null>`
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (${schema.leadStates.firstContactedAt} - ${schema.leads.postedAt})) / 60
        ) FILTER (WHERE ${schema.leadStates.firstContactedAt} IS NOT NULL)
      `,
    })
    .from(schema.leads)
    .leftJoin(schema.leadStates, eq(schema.leadStates.leadId, schema.leads.id))
    .where(base);

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
 * Daily lead volume for the Intelligence page's trend chart. Gap-filled in the
 * loop below rather than in SQL — a day with zero leads shouldn't need a
 * `generate_series` join for what's a 30-element array either way.
 */
export async function getLeadTrend(datasetId?: string, days = 30): Promise<LeadTrendPoint[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = datasetId ? eq(schema.leads.datasetId, datasetId) : undefined;
  const base = and(
    eq(schema.leads.isSpam, false),
    isNull(schema.leads.canonicalLeadId),
    gte(schema.leads.postedAt, since),
    scope,
  );

  const rows = await db()
    .select({
      date: sql<string>`to_char(date_trunc('day', ${schema.leads.postedAt}), 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) FILTER (WHERE ${schema.leads.intent} = 'buyer')::int`,
    })
    .from(schema.leads)
    .where(base)
    .groupBy(sql`date_trunc('day', ${schema.leads.postedAt})`)
    .orderBy(sql`date_trunc('day', ${schema.leads.postedAt})`);

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

  const scope = datasetId ? eq(schema.leads.datasetId, datasetId) : undefined;
  const base = and(eq(schema.leads.isSpam, false), isNull(schema.leads.canonicalLeadId), scope);
  const stated = sql`coalesce(${schema.leads.budgetUsdMax}, ${schema.leads.budgetUsdMin})`;

  const [row] = await db()
    .select({
      withBudget: sql<number>`count(*) FILTER (WHERE ${stated} IS NOT NULL)::int`,
      medianUsd: sql<number | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${stated})`,
      minUsd: sql<number | null>`min(${schema.leads.budgetUsdMin})`,
      maxUsd: sql<number | null>`max(${schema.leads.budgetUsdMax})`,
    })
    .from(schema.leads)
    .where(base);

  return {
    withBudget: row.withBudget,
    medianUsd: row.medianUsd === null ? null : Math.round(Number(row.medianUsd)),
    minUsd: row.minUsd === null ? null : Math.round(Number(row.minUsd)),
    maxUsd: row.maxUsd === null ? null : Math.round(Number(row.maxUsd)),
  };
}
