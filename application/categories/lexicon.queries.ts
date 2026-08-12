import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { REAL_ESTATE_LEXICON, type LexiconBundle } from "@/domain/scoring/lexicon-registry";

/**
 * Builds a `LexiconBundle` (domain/scoring/rules-classifier.ts's injected
 * dependency) from `category_lexicon_phrases` — the DB-driven replacement
 * for the old static per-category lexicon files. Falls back to
 * `REAL_ESTATE_LEXICON` when a category has zero phrases (a brand-new
 * category before anyone has tuned it) rather than scoring everything as
 * zero-intent — same fallback the old "other" category used before
 * categories were dynamic. Called once per sync batch by
 * `application/leads/process-records.ts`/`application/sync/preview-source.ts`,
 * not per record.
 */
export async function getLexiconBundleForCategory(categoryId: string): Promise<LexiconBundle> {
  const rows = await db()
    .select({
      intent: schema.categoryLexiconPhrases.intent,
      phrase: schema.categoryLexiconPhrases.phrase,
      weight: schema.categoryLexiconPhrases.weight,
      lang: schema.categoryLexiconPhrases.lang,
    })
    .from(schema.categoryLexiconPhrases)
    .where(eq(schema.categoryLexiconPhrases.categoryId, categoryId));

  if (rows.length === 0) return REAL_ESTATE_LEXICON;

  const bundle: LexiconBundle = { buyer: [], seller: [], agent: [], investor: [], broker: [] };
  for (const row of rows) {
    bundle[row.intent].push({ text: row.phrase, weight: row.weight, lang: row.lang as "en" | "id" });
  }
  return bundle;
}
