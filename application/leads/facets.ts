import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/infrastructure/db/client";
import { leadsTag } from "@/application/cache-tags";
import { FACETABLE_MAX_CARDINALITY } from "@/shared/constants";

/**
 * Facet descriptors drive every dynamic surface: filter controls, table columns,
 * chart dimensions. They are derived from the data on every request rather than
 * enumerated in code, so a dataset that introduces "penthouse" produces a
 * Penthouse filter chip with no deploy.
 */
export type FacetDescriptor =
  | {
      key: string;
      label: string;
      kind: "enum";
      options: { value: string; label: string; count: number }[];
    }
  | { key: string; label: string; kind: "range"; min: number; max: number; unit?: string }
  | { key: string; label: string; kind: "date"; min: string; max: string }
  | { key: string; label: string; kind: "bool" }
  | { key: string; label: string; kind: "text" };

function humanize(value: string): string {
  return value
    .replace(/[_.]/g, " ")
    .replace(/\[\]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

async function arrayFacet(
  column: AnyPgColumn,
  key: string,
  label: string,
  scope: ReturnType<typeof and>,
): Promise<FacetDescriptor | null> {
  const rows = await db()
    .select({
      value: sql<string>`unnest(${column})`.as("value"),
      count: sql<number>`count(*)::int`,
    })
    .from(schema.leads)
    .where(scope)
    .groupBy(sql`value`)
    .orderBy(sql`count(*) DESC`)
    .limit(FACETABLE_MAX_CARDINALITY);

  if (rows.length === 0) return null;
  return {
    key,
    label,
    kind: "enum",
    options: rows.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
  };
}

/**
 * Cached like `getLeadStats` and for the same reason: keyed on `datasetId`
 * alone, bounded key space, same `leadsTag()` invalidation lifecycle.
 *
 * `leads` has no `isSpam`/`canonicalLeadId` to scope out — every row here
 * already *is* the deduped, canonical person by construction. `datasetId`
 * scoping is an `EXISTS` against `lead_appearances` (a person isn't scoped to
 * one dataset), not a direct column.
 */
export async function getLeadFacets(companyId: string, datasetId?: string): Promise<FacetDescriptor[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const scope = and(
    eq(schema.leads.companyId, companyId),
    datasetId
      ? sql`EXISTS (SELECT 1 FROM ${schema.leadAppearances}
          WHERE ${schema.leadAppearances.leadId} = ${schema.leads.id}
          AND ${schema.leadAppearances.companyId} = ${companyId}
          AND ${schema.leadAppearances.datasetId} = ${datasetId})`
      : undefined,
  );

  const facets: FacetDescriptor[] = [];

  const leadType = await db()
    .select({ value: schema.leads.leadType, count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(scope)
    .groupBy(schema.leads.leadType)
    .orderBy(sql`count(*) DESC`);

  if (leadType.length > 0) {
    facets.push({
      key: "leadType",
      label: "Lead type",
      kind: "enum",
      options: leadType.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
    });
  }

  const dataQuality = await db()
    .select({ value: schema.leads.dataQualityTier, count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(scope)
    .groupBy(schema.leads.dataQualityTier)
    .orderBy(sql`count(*) DESC`);

  if (dataQuality.length > 0) {
    facets.push({
      key: "dataQuality",
      label: "Data quality",
      kind: "enum",
      options: dataQuality.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
    });
  }

  const status = await db()
    .select({ value: schema.leadStates.status, count: sql<number>`count(*)::int` })
    .from(schema.leadStates)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.leadStates.leadId))
    .where(scope)
    .groupBy(schema.leadStates.status)
    .orderBy(sql`count(*) DESC`);

  if (status.length > 0) {
    facets.push({
      key: "status",
      label: "Status",
      kind: "enum",
      options: status.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
    });
  }

  const propertyTypes = await arrayFacet(
    schema.leads.propertyTypes,
    "propertyTypes",
    "Property type",
    scope,
  );
  if (propertyTypes) facets.push(propertyTypes);

  const locations = await arrayFacet(schema.leads.locations, "locations", "Location", scope);
  if (locations) facets.push(locations);

  // Source group and record kind are appearance-level — count *distinct
  // people* per value (a person seen 5 times in one group counts once), from
  // `lead_appearances` directly rather than `leads`.
  const appearanceScope = and(
    eq(schema.leadAppearances.companyId, companyId),
    eq(schema.leadAppearances.isSpam, false),
    sql`${schema.leadAppearances.canonicalAppearanceId} IS NULL`,
    datasetId ? eq(schema.leadAppearances.datasetId, datasetId) : undefined,
  );

  const groups = await db()
    .select({
      value: schema.leadAppearances.sourceGroup,
      count: sql<number>`count(distinct ${schema.leadAppearances.leadId})::int`,
    })
    .from(schema.leadAppearances)
    .where(and(appearanceScope, sql`${schema.leadAppearances.sourceGroup} IS NOT NULL`))
    .groupBy(schema.leadAppearances.sourceGroup)
    .orderBy(sql`count(distinct ${schema.leadAppearances.leadId}) DESC`)
    .limit(FACETABLE_MAX_CARDINALITY);

  if (groups.length > 1) {
    facets.push({
      key: "groups",
      label: "Source group",
      kind: "enum",
      options: groups.map((r) => ({
        value: r.value ?? "",
        label: r.value ?? "Unknown",
        count: r.count,
      })),
    });
  }

  // Which connector/platform (Apify, n8n, ...) produced each lead's appearances —
  // "Data source" in the dashboard's filter panel. Joined through `datasets`
  // since `lead_appearances` only carries `datasetId`, not `sourceId` directly.
  const sources = await db()
    .select({
      value: schema.sources.id,
      label: schema.sources.name,
      count: sql<number>`count(distinct ${schema.leadAppearances.leadId})::int`,
    })
    .from(schema.leadAppearances)
    .innerJoin(schema.datasets, eq(schema.datasets.id, schema.leadAppearances.datasetId))
    .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
    .where(appearanceScope)
    .groupBy(schema.sources.id, schema.sources.name)
    .orderBy(sql`count(distinct ${schema.leadAppearances.leadId}) DESC`)
    .limit(FACETABLE_MAX_CARDINALITY);

  if (sources.length > 0) {
    facets.push({
      key: "sourceIds",
      label: "Data source",
      kind: "enum",
      options: sources.map((r) => ({ value: r.value, label: r.label, count: r.count })),
    });
  }

  const recordKind = await db()
    .select({
      value: schema.leadAppearances.recordKind,
      count: sql<number>`count(distinct ${schema.leadAppearances.leadId})::int`,
    })
    .from(schema.leadAppearances)
    .where(appearanceScope)
    .groupBy(schema.leadAppearances.recordKind)
    .orderBy(sql`count(distinct ${schema.leadAppearances.leadId}) DESC`);

  // Not worth a filter chip when every lead is the same kind — the common case
  // today, until an engagement source is actually wired up.
  if (recordKind.length > 1) {
    facets.push({
      key: "recordKind",
      label: "Record type",
      kind: "enum",
      options: recordKind.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
    });
  }

  const [budget] = await db()
    .select({
      min: sql<number | null>`min(${schema.leads.budgetUsdMin})`,
      max: sql<number | null>`max(${schema.leads.budgetUsdMax})`,
    })
    .from(schema.leads)
    .where(scope);

  if (budget?.min !== null && budget?.max !== null && budget.max > budget.min) {
    facets.push({
      key: "budget",
      label: "Budget",
      kind: "range",
      min: Number(budget.min),
      max: Number(budget.max),
      unit: "USD",
    });
  }

  facets.push({ key: "minBuyerScore", label: "Min buyer score", kind: "range", min: 0, max: 100 });
  facets.push({ key: "hasContact", label: "Has contact details", kind: "bool" });

  return facets;
}

/**
 * Facets over fields that were *discovered* rather than designed. This is the
 * passthrough path: an upstream field nobody has ever seen becomes a working
 * filter as soon as it appears in enough records. Still appearance-scoped
 * (`attributes` lives on `lead_appearances`), counting distinct people per
 * value rather than raw appearance rows.
 */
export async function getDynamicAttributeFacets(
  companyId: string,
  datasetId: string,
): Promise<FacetDescriptor[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const catalog = await db()
    .select()
    .from(schema.fieldCatalog)
    .where(and(eq(schema.fieldCatalog.companyId, companyId), eq(schema.fieldCatalog.datasetId, datasetId)));

  const facetable = catalog.filter((f) => f.facetableOverride ?? f.facetable);
  if (facetable.length === 0) return [];

  // One DB round trip per candidate field, run concurrently rather than
  // sequentially — a dataset with a dozen facetable fields previously meant a
  // dozen serial awaits (each waiting on the full latency of the last) before
  // the facet panel could render at all.
  const descriptors = await Promise.all(
    facetable
      // Only top-level keys survive passthrough into `attributes`.
      .filter((field) => !field.path.includes(".") && !field.path.includes("[]"))
      .map(async (field): Promise<FacetDescriptor | null> => {
        const key = field.path.split(".")[0].replace(/\[\]$/, "");

        const rows = await db()
          .select({
            value: sql<string>`${schema.leadAppearances.attributes}->>${key}`,
            count: sql<number>`count(distinct ${schema.leadAppearances.leadId})::int`,
          })
          .from(schema.leadAppearances)
          .where(
            and(
              eq(schema.leadAppearances.companyId, companyId),
              eq(schema.leadAppearances.datasetId, datasetId),
              eq(schema.leadAppearances.isSpam, false),
              sql`${schema.leadAppearances.attributes} ? ${key}`,
            ),
          )
          .groupBy(sql`${schema.leadAppearances.attributes}->>${key}`)
          .orderBy(sql`count(distinct ${schema.leadAppearances.leadId}) DESC`)
          .limit(FACETABLE_MAX_CARDINALITY);

        const options = rows.filter((r) => r.value !== null && r.value !== "");
        if (options.length < 2) return null;

        return {
          key: `attr.${key}`,
          label: humanize(key),
          kind: "enum",
          options: options.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
        };
      }),
  );

  return descriptors.filter((d): d is FacetDescriptor => d !== null);
}
