import "server-only";
import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { SCRAPE_PLATFORMS } from "@/shared/constants";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";

export interface SourcePlatformSummary {
  platform: string;
  total: number;
  enabled: number;
}

export interface SourceRegistryOverview {
  templates: ActorTemplateRow[];
  /** Every curated platform (`SCRAPE_PLATFORMS`) plus any free-text platform an admin registered outside that list — a platform with zero templates still shows up as "not yet configured" rather than disappearing. */
  byPlatform: SourcePlatformSummary[];
}

/**
 * The Super Admin view of the same `actor_templates` catalog a tenant admin
 * sees at `/admin/collection` — metadata about the catalog itself (which
 * sources exist, how many templates, how many enabled), never a tenant's
 * `scrape_requests`/leads. Cross-tenant-safe by construction: this table
 * isn't company-scoped in the first place.
 */
export async function getSourceRegistryOverview(): Promise<SourceRegistryOverview> {
  const templates = await db()
    .select()
    .from(schema.actorTemplates)
    .orderBy(asc(schema.actorTemplates.platform), asc(schema.actorTemplates.name));

  const counts = new Map<string, SourcePlatformSummary>();
  for (const platform of SCRAPE_PLATFORMS) {
    counts.set(platform, { platform, total: 0, enabled: 0 });
  }
  for (const template of templates) {
    const existing = counts.get(template.platform) ?? { platform: template.platform, total: 0, enabled: 0 };
    existing.total += 1;
    if (template.enabled) existing.enabled += 1;
    counts.set(template.platform, existing);
  }

  return { templates, byPlatform: Array.from(counts.values()) };
}

/** Usage across every tenant for one template — request counts only, never the leads/records a request produced. */
export async function getSourceUsageByTemplate(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ actorTemplateId: schema.scrapeRequests.actorTemplateId, count: sql<number>`count(*)::int` })
    .from(schema.scrapeRequests)
    .where(sql`${schema.scrapeRequests.actorTemplateId} is not null`)
    .groupBy(schema.scrapeRequests.actorTemplateId);

  return new Map(rows.filter((r) => r.actorTemplateId !== null).map((r) => [r.actorTemplateId as string, r.count]));
}
