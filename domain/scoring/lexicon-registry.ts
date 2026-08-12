import { AGENT_PHRASES, BROKER_PHRASES, BUYER_PHRASES, INVESTOR_PHRASES, SELLER_PHRASES } from "./lexicon";
import {
  TRAVEL_AGENT_PHRASES,
  TRAVEL_BROKER_PHRASES,
  TRAVEL_BUYER_PHRASES,
  TRAVEL_INVESTOR_PHRASES,
  TRAVEL_SELLER_PHRASES,
} from "./lexicons/travel";
import {
  COURSES_AGENT_PHRASES,
  COURSES_BROKER_PHRASES,
  COURSES_BUYER_PHRASES,
  COURSES_INVESTOR_PHRASES,
  COURSES_SELLER_PHRASES,
} from "./lexicons/courses";
import type { Phrase } from "./lexicon";
import type { CompanyCategory } from "@/domain/verticals/catalog";

/**
 * The five intent-signal phrase lists `rules-classifier.ts` matches against.
 * Deliberately excludes `SPAM_PHRASES`/`RECRUITMENT_PHRASES` — off-topic-post
 * and job-posting detection is vertical-agnostic enough to share across every
 * category, so those two stay imported directly from `./lexicon.ts` at the
 * classifier call site rather than duplicated per vertical.
 */
export interface LexiconBundle {
  buyer: Phrase[];
  seller: Phrase[];
  agent: Phrase[];
  investor: Phrase[];
  broker: Phrase[];
}

/** Real estate is the default/original lexicon — every existing caller that doesn't pass a category gets exactly this, unchanged. */
export const REAL_ESTATE_LEXICON: LexiconBundle = {
  buyer: BUYER_PHRASES,
  seller: SELLER_PHRASES,
  agent: AGENT_PHRASES,
  investor: INVESTOR_PHRASES,
  broker: BROKER_PHRASES,
};

const TRAVEL_LEXICON: LexiconBundle = {
  buyer: TRAVEL_BUYER_PHRASES,
  seller: TRAVEL_SELLER_PHRASES,
  agent: TRAVEL_AGENT_PHRASES,
  investor: TRAVEL_INVESTOR_PHRASES,
  broker: TRAVEL_BROKER_PHRASES,
};

const COURSES_LEXICON: LexiconBundle = {
  buyer: COURSES_BUYER_PHRASES,
  seller: COURSES_SELLER_PHRASES,
  agent: COURSES_AGENT_PHRASES,
  investor: COURSES_INVESTOR_PHRASES,
  broker: COURSES_BROKER_PHRASES,
};

const LEXICONS_BY_CATEGORY: Record<CompanyCategory, LexiconBundle> = {
  real_estate: REAL_ESTATE_LEXICON,
  travel: TRAVEL_LEXICON,
  courses: COURSES_LEXICON,
  // No dedicated phrase list exists yet for a category outside the three
  // above — real estate's lexicon is the closest fallback (this platform's
  // original and best-tuned one) rather than an empty bundle that would
  // score every "other"-category lead as low-intent by default.
  other: REAL_ESTATE_LEXICON,
};

export function getLexiconForCategory(category: CompanyCategory): LexiconBundle {
  return LEXICONS_BY_CATEGORY[category];
}
