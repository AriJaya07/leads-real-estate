import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { recomputePersonRollup } from "./identity-resolution";

export class SplitLeadError extends Error {}

/**
 * Undoes one `merged` lead event — the escape hatch `docs/platform-super-admin-flow.md`'s
 * sibling design note (the lead-detail-sheet mock) calls "Split this merge."
 * Only ever splits off *one appearance*, never the whole person, and never
 * deletes anything — same "no hard delete" posture as the rest of the
 * ingestion path (agent-rules.md).
 *
 * The identity signal that caused the merge (`facebookId`/`instagramId`/
 * normalized `profileUrl`) is a unique key on `leads` — it can only ever live
 * on one row at a time, so it stays on the *original* lead. The appearance
 * this splits off becomes a new, lower-confidence lead identified by name/
 * avatar/bio/contact only — an honest outcome, not a bug: if the identity
 * match was in fact correct (same Facebook account posted both), the two
 * really are the same person and re-splitting them apart can't restore a
 * shared identity key to both sides without violating that same uniqueness
 * guarantee. This is for the case where the match was wrong for a reason the
 * identity key itself doesn't capture — e.g. a shared/handed-off account.
 */
export async function splitAppearanceIntoNewLead(
  companyId: string,
  appearanceId: string,
  actorId: string,
): Promise<{ newLeadId: string; oldLeadId: string }> {
  const [appearance] = await db()
    .select()
    .from(schema.leadAppearances)
    .where(and(eq(schema.leadAppearances.id, appearanceId), eq(schema.leadAppearances.companyId, companyId)))
    .limit(1);
  if (!appearance) throw new SplitLeadError("Appearance not found.");
  if (appearance.canonicalAppearanceId) {
    throw new SplitLeadError("This appearance is a re-scrape of another one — split the original instead.");
  }

  const oldLeadId = appearance.leadId;

  const [{ remaining }] = await db()
    .select({ remaining: sql<number>`count(*)::int` })
    .from(schema.leadAppearances)
    .where(and(eq(schema.leadAppearances.leadId, oldLeadId), ne(schema.leadAppearances.id, appearanceId)));
  if (remaining === 0) {
    throw new SplitLeadError("This is the only appearance for this person — nothing to split.");
  }

  const [newLead] = await db()
    .insert(schema.leads)
    .values({
      companyId,
      username: appearance.authorUsername,
      name: appearance.authorName,
      avatarUrl: appearance.authorAvatarUrl,
      location: appearance.authorLocation,
      bio: appearance.authorBio,
      contact: appearance.contact,
      // Deliberately not carrying facebookId/instagramId/profileUrl forward —
      // see the function doc comment on why that key stays with `oldLeadId`.
      profileUrl: null,
    })
    .returning({ id: schema.leads.id });

  await db()
    .update(schema.leadAppearances)
    .set({ leadId: newLead.id, updatedAt: new Date() })
    .where(eq(schema.leadAppearances.id, appearanceId));

  await db().insert(schema.leadEvents).values([
    {
      companyId,
      leadId: oldLeadId,
      type: "split",
      actorId,
      payload: { direction: "split_off", toLeadId: newLead.id, appearanceId },
    },
    {
      companyId,
      leadId: newLead.id,
      type: "split",
      actorId,
      payload: { direction: "split_from", fromLeadId: oldLeadId, appearanceId },
    },
  ]);

  await Promise.all([
    recomputePersonRollup(companyId, oldLeadId),
    recomputePersonRollup(companyId, newLead.id),
  ]);

  return { newLeadId: newLead.id, oldLeadId };
}
