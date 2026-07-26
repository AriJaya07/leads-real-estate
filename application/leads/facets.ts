import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
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
 */
export async function getLeadFacets(datasetId?: string): Promise<FacetDescriptor[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const scope = and(
    eq(schema.leads.isSpam, false),
    isNull(schema.leads.canonicalLeadId),
    datasetId ? eq(schema.leads.datasetId, datasetId) : undefined,
  );

  const facets: FacetDescriptor[] = [];

  const intent = await db()
    .select({ value: schema.leads.intent, count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(scope)
    .groupBy(schema.leads.intent)
    .orderBy(sql`count(*) DESC`);

  if (intent.length > 0) {
    facets.push({
      key: "intent",
      label: "Intent",
      kind: "enum",
      options: intent.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
    });
  }

  const recordKind = await db()
    .select({ value: schema.leads.recordKind, count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(scope)
    .groupBy(schema.leads.recordKind)
    .orderBy(sql`count(*) DESC`);

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

  const groups = await db()
    .select({ value: schema.leads.sourceGroup, count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(scope, sql`${schema.leads.sourceGroup} IS NOT NULL`))
    .groupBy(schema.leads.sourceGroup)
    .orderBy(sql`count(*) DESC`)
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

  facets.push({ key: "minIntent", label: "Min intent score", kind: "range", min: 0, max: 100 });
  facets.push({ key: "hasContact", label: "Has contact details", kind: "bool" });

  return facets;
}

/**
 * Facets over fields that were *discovered* rather than designed. This is the
 * passthrough path: an upstream field nobody has ever seen becomes a working
 * filter as soon as it appears in enough records.
 */
export async function getDynamicAttributeFacets(datasetId: string): Promise<FacetDescriptor[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(leadsTag());

  const catalog = await db()
    .select()
    .from(schema.fieldCatalog)
    .where(eq(schema.fieldCatalog.datasetId, datasetId));

  const facetable = catalog.filter((f) => f.facetableOverride ?? f.facetable);
  if (facetable.length === 0) return [];

  const descriptors: FacetDescriptor[] = [];

  for (const field of facetable) {
    // Only top-level keys survive passthrough into `attributes`.
    const key = field.path.split(".")[0].replace(/\[\]$/, "");
    if (field.path.includes(".") || field.path.includes("[]")) continue;

    const rows = await db()
      .select({
        value: sql<string>`${schema.leads.attributes}->>${key}`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.datasetId, datasetId),
          eq(schema.leads.isSpam, false),
          sql`${schema.leads.attributes} ? ${key}`,
        ),
      )
      .groupBy(sql`${schema.leads.attributes}->>${key}`)
      .orderBy(sql`count(*) DESC`)
      .limit(FACETABLE_MAX_CARDINALITY);

    const options = rows.filter((r) => r.value !== null && r.value !== "");
    if (options.length < 2) continue;

    descriptors.push({
      key: `attr.${key}`,
      label: humanize(key),
      kind: "enum",
      options: options.map((r) => ({ value: r.value, label: humanize(r.value), count: r.count })),
    });
  }

  return descriptors;
}
