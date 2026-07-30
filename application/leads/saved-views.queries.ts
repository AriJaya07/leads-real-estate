import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import type { SavedViewRow } from "@/infrastructure/db/schema/leads";

/**
 * A user's own saved searches plus every one the team has shared — the same
 * "personal or shared" split `shared`/`ownerId` model the rest of this
 * codebase doesn't have elsewhere, but is exactly what `saved_views` was
 * shaped for (see its schema comment: "shareable, first-class objects rather
 * than ad-hoc URLs").
 */
export async function listSavedViews(companyId: string, userId: string): Promise<SavedViewRow[]> {
  return db()
    .select()
    .from(schema.savedViews)
    .where(
      and(eq(schema.savedViews.companyId, companyId), or(eq(schema.savedViews.ownerId, userId), eq(schema.savedViews.shared, true))),
    )
    .orderBy(asc(schema.savedViews.name));
}
