import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { VerticalFieldLabels } from "@/domain/verticals/catalog";

export interface CategoryOption {
  id: string;
  slug: string;
  label: string;
  description: string;
  fieldLabels: VerticalFieldLabels;
}

/** `/signup`'s category picker — public, unauthenticated, `active` only. */
export async function listActiveCategories(): Promise<CategoryOption[]> {
  return db()
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      label: schema.categories.label,
      description: schema.categories.description,
      fieldLabels: schema.categories.fieldLabels,
    })
    .from(schema.categories)
    .where(eq(schema.categories.status, "active"))
    .orderBy(schema.categories.label);
}

/** Every category regardless of status — actor-template tagging (`/admin/collection`) and Super Admin surfaces. */
export async function listAllCategoriesBasic(): Promise<CategoryOption[]> {
  return db()
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      label: schema.categories.label,
      description: schema.categories.description,
      fieldLabels: schema.categories.fieldLabels,
    })
    .from(schema.categories)
    .orderBy(schema.categories.label);
}

export interface CategoryOverviewRow {
  id: string;
  slug: string;
  label: string;
  description: string;
  status: "active" | "beta" | "disabled";
  tenantCount: number;
  actorTemplateCount: number;
}

/** `/platform/categories` overview — adoption vs. registered Apify actor templates per category. */
export async function getCategoryOverview(): Promise<CategoryOverviewRow[]> {
  const [categories, tenantCounts, templateCounts] = await Promise.all([
    db().select().from(schema.categories).orderBy(schema.categories.label),
    db()
      .select({ categoryId: schema.companies.categoryId, count: sql<number>`count(*)::int` })
      .from(schema.companies)
      .groupBy(schema.companies.categoryId),
    db()
      .select({ categoryId: schema.actorTemplates.categoryId, count: sql<number>`count(*)::int` })
      .from(schema.actorTemplates)
      .where(eq(schema.actorTemplates.enabled, true))
      .groupBy(schema.actorTemplates.categoryId),
  ]);

  const tenantCountByCategory = new Map(tenantCounts.map((r) => [r.categoryId, r.count]));
  const templateCountByCategory = new Map(templateCounts.map((r) => [r.categoryId, r.count]));
  // Templates with categoryId=null apply to every category equally.
  const generalTemplateCount = templateCountByCategory.get(null) ?? 0;

  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.label,
    description: c.description,
    status: c.status,
    tenantCount: tenantCountByCategory.get(c.id) ?? 0,
    actorTemplateCount: (templateCountByCategory.get(c.id) ?? 0) + generalTemplateCount,
  }));
}

export interface CategoryFilterPresets {
  categoryFieldOptions: string[];
  locationOptions: string[];
}

export interface CategoryDetail {
  id: string;
  slug: string;
  label: string;
  description: string;
  fieldLabels: VerticalFieldLabels;
  status: "active" | "beta" | "disabled";
  filterPresets: CategoryFilterPresets;
  internalNotes: string | null;
  tenantCount: number;
  actorTemplateCount: number;
  updatedAt: Date;
}

export async function getCategoryDetail(slug: string): Promise<CategoryDetail | null> {
  const [category] = await db().select().from(schema.categories).where(eq(schema.categories.slug, slug)).limit(1);
  if (!category) return null;

  const [[{ tenantCount }], [{ actorTemplateCount }]] = await Promise.all([
    db()
      .select({ tenantCount: sql<number>`count(*)::int` })
      .from(schema.companies)
      .where(eq(schema.companies.categoryId, category.id)),
    db()
      .select({ actorTemplateCount: sql<number>`count(*)::int` })
      .from(schema.actorTemplates)
      .where(sql`${schema.actorTemplates.categoryId} = ${category.id} AND ${schema.actorTemplates.enabled} = true`),
  ]);

  return {
    id: category.id,
    slug: category.slug,
    label: category.label,
    description: category.description,
    fieldLabels: category.fieldLabels,
    status: category.status,
    filterPresets: category.filterPresets,
    internalNotes: category.internalNotes,
    tenantCount,
    actorTemplateCount,
    updatedAt: category.updatedAt,
  };
}

export interface LexiconPhraseRow {
  id: string;
  intent: "buyer" | "seller" | "agent" | "investor" | "broker";
  phrase: string;
  weight: number;
  lang: string;
}

export async function listLexiconPhrases(categoryId: string): Promise<LexiconPhraseRow[]> {
  return db()
    .select({
      id: schema.categoryLexiconPhrases.id,
      intent: schema.categoryLexiconPhrases.intent,
      phrase: schema.categoryLexiconPhrases.phrase,
      weight: schema.categoryLexiconPhrases.weight,
      lang: schema.categoryLexiconPhrases.lang,
    })
    .from(schema.categoryLexiconPhrases)
    .where(eq(schema.categoryLexiconPhrases.categoryId, categoryId))
    .orderBy(schema.categoryLexiconPhrases.intent, desc(schema.categoryLexiconPhrases.weight));
}

export interface PlatformCategoryActionLogRow {
  id: string;
  action: string;
  details: Record<string, unknown>;
  platformAdminName: string | null;
  platformAdminEmail: string | null;
  createdAt: Date;
}

export async function listCategoryActions(categoryId: string): Promise<PlatformCategoryActionLogRow[]> {
  return db()
    .select({
      id: schema.platformCategoryActions.id,
      action: schema.platformCategoryActions.action,
      details: schema.platformCategoryActions.details,
      platformAdminName: schema.users.name,
      platformAdminEmail: schema.users.email,
      createdAt: schema.platformCategoryActions.createdAt,
    })
    .from(schema.platformCategoryActions)
    .leftJoin(schema.users, eq(schema.users.id, schema.platformCategoryActions.platformAdminUserId))
    .where(eq(schema.platformCategoryActions.categoryId, categoryId))
    .orderBy(desc(schema.platformCategoryActions.createdAt))
    .limit(30);
}
