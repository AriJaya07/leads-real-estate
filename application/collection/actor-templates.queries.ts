import "server-only";
import { asc } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { ActorTemplateRow } from "@/infrastructure/db/schema/collection";

/**
 * Global reference data, same posture as `mapping_profiles` — an actor template
 * isn't company-specific, so every company's admins see the same catalog and
 * every company's usage is tracked separately on `scrape_requests`.
 */
export async function listActorTemplates(): Promise<ActorTemplateRow[]> {
  return db()
    .select()
    .from(schema.actorTemplates)
    .orderBy(asc(schema.actorTemplates.platform), asc(schema.actorTemplates.name));
}
