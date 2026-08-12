import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { COMPANY_CATEGORIES, VERTICALS, type CompanyCategory } from "@/domain/verticals/catalog";

export interface CategoryOverviewRow {
  category: CompanyCategory;
  label: string;
  description: string;
  tenantCount: number;
  actorTemplateCount: number;
}

/**
 * Cross-company rollup of the vertical catalog (`domain/verticals/catalog.ts`)
 * against what's actually registered/adopted — how many tenants picked each
 * category at signup, and how many admin-registered Apify actor templates
 * (`actor_templates.category`) are tagged for it. Read-only: this page is
 * where a platform operator notices "12 travel tenants, zero travel actor
 * templates" and goes fixes that in `/admin/collection`'s Actor templates
 * section (global, not per-tenant) — not a place that edits the catalog
 * itself, which is a code-level file on purpose (see that file's own
 * comment on why category is a small, closed set).
 */
export async function getCategoryOverview(): Promise<CategoryOverviewRow[]> {
  const [tenantCounts, templateCounts] = await Promise.all([
    db()
      .select({ category: schema.companies.category, count: sql<number>`count(*)::int` })
      .from(schema.companies)
      .groupBy(schema.companies.category),
    db()
      .select({ category: schema.actorTemplates.category, count: sql<number>`count(*)::int` })
      .from(schema.actorTemplates)
      .where(eq(schema.actorTemplates.enabled, true))
      .groupBy(schema.actorTemplates.category),
  ]);

  const tenantCountByCategory = new Map(tenantCounts.map((r) => [r.category, r.count]));
  const templateCountByCategory = new Map(templateCounts.map((r) => [r.category, r.count]));
  // Templates with category=null apply to every category equally (see that
  // column's comment) — folded into each row's count rather than shown as
  // its own "no category" row, since it's not a tenant-facing category.
  const generalTemplateCount = templateCountByCategory.get(null as unknown as CompanyCategory) ?? 0;

  return COMPANY_CATEGORIES.map((category) => ({
    category,
    label: VERTICALS[category].label,
    description: VERTICALS[category].description,
    tenantCount: tenantCountByCategory.get(category) ?? 0,
    actorTemplateCount: (templateCountByCategory.get(category) ?? 0) + generalTemplateCount,
  }));
}
