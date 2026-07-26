import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import {
  identityKeys,
  mergePersonalInfo,
  normalizeProfileUrl,
  type IdentityCandidate,
  type PersonalInfo,
} from "@/domain/lead/identity";
import { rollupPersonScores, type AppearanceForRollup } from "@/domain/scoring/lead-rollup";
import type { ContactInfo } from "@/domain/scoring/types";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("identity-resolution");

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === UNIQUE_VIOLATION);
}

export interface AppearanceIdentitySnapshot extends IdentityCandidate {
  name: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
  contact: ContactInfo;
}

function matchCondition(key: { type: "facebookId" | "instagramId" | "profileUrl"; value: string }) {
  if (key.type === "facebookId") return eq(schema.leads.facebookId, key.value);
  if (key.type === "instagramId") return eq(schema.leads.instagramId, key.value);
  return eq(schema.leads.profileUrl, key.value);
}

function toPersonalInfo(row: {
  facebookId: string | null;
  instagramId: string | null;
  profileUrl: string | null;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
}): PersonalInfo {
  return {
    facebookId: row.facebookId,
    instagramId: row.instagramId,
    profileUrl: row.profileUrl,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatarUrl,
    location: row.location,
    bio: row.bio,
  };
}

/**
 * Finds an existing person by exact identity match — `facebookId`, then
 * `instagramId`, then normalized `profileUrl`, in that precedence order — or
 * creates a new one. An existing match gets any identity/personal-info fields
 * it was missing filled in (never overwritten — see
 * `domain/lead/identity.ts::mergePersonalInfo`).
 *
 * Race-safe: two concurrent ingests resolving the same new identity both miss
 * the initial SELECT, one wins the INSERT, the other catches the unique
 * violation from `leads_facebook_id_key`/`leads_instagram_id_key`/
 * `leads_profile_url_key` and re-reads the winner's row instead of erroring.
 */
export async function resolveIdentity(candidate: AppearanceIdentitySnapshot): Promise<string> {
  const keys = identityKeys(candidate);

  if (keys.length > 0) {
    const [existing] = await db()
      .select()
      .from(schema.leads)
      .where(or(...keys.map(matchCondition)))
      .limit(1);

    if (existing) {
      const merged = mergePersonalInfo(toPersonalInfo(existing), {
        facebookId: candidate.facebookId ?? null,
        instagramId: candidate.instagramId ?? null,
        profileUrl: normalizeProfileUrl(candidate.profileUrl),
        username: candidate.username ?? null,
        name: candidate.name,
        avatarUrl: candidate.avatarUrl,
        location: candidate.location,
        bio: candidate.bio,
      });

      const changed = (Object.keys(merged) as (keyof PersonalInfo)[]).some(
        (key) => merged[key] !== toPersonalInfo(existing)[key],
      );
      const contactChanged =
        !existing.contact?.phone && !existing.contact?.whatsapp && !existing.contact?.email
          ? Boolean(candidate.contact.phone || candidate.contact.whatsapp || candidate.contact.email)
          : false;

      if (changed || contactChanged) {
        await db()
          .update(schema.leads)
          .set({
            ...merged,
            contact: contactChanged ? { ...existing.contact, ...candidate.contact } : existing.contact,
            updatedAt: new Date(),
          })
          .where(eq(schema.leads.id, existing.id));
      }

      return existing.id;
    }

    try {
      const [created] = await db()
        .insert(schema.leads)
        .values({
          facebookId: candidate.facebookId ?? null,
          instagramId: candidate.instagramId ?? null,
          profileUrl: normalizeProfileUrl(candidate.profileUrl),
          username: candidate.username ?? null,
          name: candidate.name,
          avatarUrl: candidate.avatarUrl,
          location: candidate.location,
          bio: candidate.bio,
          contact: candidate.contact,
        })
        .returning({ id: schema.leads.id });
      return created.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [winner] = await db()
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(or(...keys.map(matchCondition)))
        .limit(1);
      if (winner) return winner.id;
      throw error;
    }
  }

  // No facebookId/instagramId/profileUrl at all — can't merge without an
  // identity signal, so this always becomes its own person. The partial
  // unique indexes on `leads` explicitly exclude NULL, so multiple such rows
  // never conflict with each other.
  const [created] = await db()
    .insert(schema.leads)
    .values({
      username: candidate.username ?? null,
      name: candidate.name,
      avatarUrl: candidate.avatarUrl,
      location: candidate.location,
      bio: candidate.bio,
      contact: candidate.contact,
    })
    .returning({ id: schema.leads.id });
  return created.id;
}

/**
 * Recomputes and persists a person's AI-analysis rollup from every current
 * non-spam, non-duplicate appearance they have. Called after every appearance
 * upsert that isn't itself a duplicate — cheap (one indexed query on
 * `lead_appearances_lead_idx`) and idempotent, same "derived, freely
 * regenerable" contract as the appearance-level scores it reads.
 */
export async function recomputePersonRollup(leadId: string): Promise<void> {
  const rows = await db()
    .select({
      intent: schema.leadAppearances.intent,
      intentScore: schema.leadAppearances.intentScore,
      investorScore: schema.leadAppearances.investorScore,
      brokerScore: schema.leadAppearances.brokerScore,
      recordKind: schema.leadAppearances.recordKind,
      propertyTypes: schema.leadAppearances.propertyTypes,
      locations: schema.leadAppearances.locations,
      contact: schema.leadAppearances.contact,
      postedAt: schema.leadAppearances.postedAt,
      scoreReasons: schema.leadAppearances.scoreReasons,
    })
    .from(schema.leadAppearances)
    .where(
      and(
        eq(schema.leadAppearances.leadId, leadId),
        eq(schema.leadAppearances.isSpam, false),
        isNull(schema.leadAppearances.canonicalAppearanceId),
      ),
    );

  const appearances: AppearanceForRollup[] = rows.map((row) => ({
    intent: row.intent,
    intentScore: row.intentScore,
    investorScore: row.investorScore,
    brokerScore: row.brokerScore,
    recordKind: row.recordKind,
    propertyTypes: row.propertyTypes,
    locations: row.locations,
    hasContact: Boolean(row.contact?.phone || row.contact?.whatsapp || row.contact?.email),
    postedAt: row.postedAt,
    scoreReasons: row.scoreReasons,
  }));

  const rollup = rollupPersonScores(appearances);

  // Most-recently-posted non-null budget wins — a stated budget can change
  // over time; range-merging across appearances risks a nonsensical combined
  // range more than it risks staleness. A plain "most recent" pick, not a
  // scoring decision, so it's computed here rather than in the pure rollup.
  const [budgetSource] = await db()
    .select({
      budgetMin: schema.leadAppearances.budgetMin,
      budgetMax: schema.leadAppearances.budgetMax,
      budgetCurrency: schema.leadAppearances.budgetCurrency,
      budgetUsdMin: schema.leadAppearances.budgetUsdMin,
      budgetUsdMax: schema.leadAppearances.budgetUsdMax,
    })
    .from(schema.leadAppearances)
    .where(
      and(
        eq(schema.leadAppearances.leadId, leadId),
        eq(schema.leadAppearances.isSpam, false),
        isNull(schema.leadAppearances.canonicalAppearanceId),
        sql`${schema.leadAppearances.budgetCurrency} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.leadAppearances.postedAt))
    .limit(1);

  await db()
    .update(schema.leads)
    .set({
      leadType: rollup.leadType,
      buyerScore: rollup.buyerScore,
      sellerScore: rollup.sellerScore,
      investorScore: rollup.investorScore,
      confidenceScore: rollup.confidenceScore,
      aiExplanation: rollup.aiExplanation,
      classifierId: "rules-rollup@1",
      classifiedAt: new Date(),
      propertyTypes: rollup.propertyTypes,
      locations: rollup.locations,
      budgetMin: budgetSource?.budgetMin ?? null,
      budgetMax: budgetSource?.budgetMax ?? null,
      budgetCurrency: budgetSource?.budgetCurrency ?? null,
      budgetUsdMin: budgetSource?.budgetUsdMin ?? null,
      budgetUsdMax: budgetSource?.budgetUsdMax ?? null,
      latestAppearanceAt: rollup.latestAppearanceAt,
      appearanceCount: rollup.appearanceCount,
      updatedAt: new Date(),
    })
    .where(eq(schema.leads.id, leadId));

  log.debug("rollup recomputed", { leadId, leadType: rollup.leadType, appearanceCount: rollup.appearanceCount });
}
