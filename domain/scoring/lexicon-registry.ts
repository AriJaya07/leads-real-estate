import { AGENT_PHRASES, BROKER_PHRASES, BUYER_PHRASES, INVESTOR_PHRASES, SELLER_PHRASES } from "./lexicon";
import type { Phrase } from "./lexicon";

/**
 * The five intent-signal phrase lists `rules-classifier.ts` matches against.
 * Deliberately excludes `SPAM_PHRASES`/`RECRUITMENT_PHRASES` — off-topic-post
 * and job-posting detection is vertical-agnostic enough to share across every
 * category, so those two stay imported directly from `./lexicon.ts` at the
 * classifier call site rather than duplicated per category.
 */
export interface LexiconBundle {
  buyer: Phrase[];
  seller: Phrase[];
  agent: Phrase[];
  investor: Phrase[];
  broker: Phrase[];
}

/**
 * Real estate is the default/original lexicon — every existing caller that
 * doesn't pass a category gets exactly this, unchanged. Also the runtime
 * fallback `application/categories/lexicon.queries.ts::getLexiconBundleForCategory`
 * uses when a category has zero `category_lexicon_phrases` rows (a brand-new
 * category before anyone has tuned it, or the seeded "other" category) —
 * matches the pre-dynamic-categories behavior where "other" fell back to
 * this same bundle rather than scoring everything as zero-intent.
 */
export const REAL_ESTATE_LEXICON: LexiconBundle = {
  buyer: BUYER_PHRASES,
  seller: SELLER_PHRASES,
  agent: AGENT_PHRASES,
  investor: INVESTOR_PHRASES,
  broker: BROKER_PHRASES,
};
