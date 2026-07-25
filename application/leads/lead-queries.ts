import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { priorityScore } from "@/domain/lead/ranking";
import type { LeadFilters } from "./filters.schema";
import { textArray, validIntents, validStatuses } from "./sql-helpers";
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
       */
      return [
        desc(sql`
          (CASE WHEN ${schema.leads.intent} = 'buyer'
                THEN (${schema.leads.intentScore} * 0.7 + ${schema.leads.qualityScore} * 0.3)
                ELSE ${schema.leads.intentScore} * 0.2 END)
          * power(2, -GREATEST(0, EXTRACT(EPOCH FROM (now() - ${schema.leads.postedAt})) / 3600.0) / 18.0)
        `),
        desc(schema.leads.postedAt),
      ];
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
 */
export async function getLeadStats(datasetId?: string): Promise<LeadStats> {
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

export async function getLeadById(leadId: string) {
  const [row] = await db()
    .select({
      lead: schema.leads,
      state: schema.leadStates,
      datasetName: schema.datasets.title,
    })
    .from(schema.leads)
    .leftJoin(schema.leadStates, eq(schema.leadStates.leadId, schema.leads.id))
    .leftJoin(schema.datasets, eq(schema.datasets.id, schema.leads.datasetId))
    .where(eq(schema.leads.id, leadId))
    .limit(1);

  if (!row) return null;

  const duplicates = await db()
    .select({
      id: schema.leads.id,
      postedAt: schema.leads.postedAt,
      externalUrl: schema.leads.externalUrl,
      authorName: schema.leads.authorName,
    })
    .from(schema.leads)
    .where(eq(schema.leads.canonicalLeadId, leadId));

  const events = await db()
    .select()
    .from(schema.leadEvents)
    .where(eq(schema.leadEvents.leadId, leadId))
    .orderBy(desc(schema.leadEvents.at))
    .limit(50);

  return { ...row, duplicates, events };
}
