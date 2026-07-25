import { parsePhoneNumberFromString } from "libphonenumber-js";
import { parseMoney } from "@/domain/dataset/mapping";
import {
  BALI_LOCATIONS,
  LOCATION_ALIASES,
  PROPERTY_TYPE_TERMS,
  type Phrase,
  NEGATION_WINDOW,
  NEGATORS,
} from "./lexicon";
import type { BudgetRange, ContactInfo } from "./types";

/** Word-boundary containment. `includes()` matches "budget" inside "budgeting". */
function findPhrase(haystack: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
  const match = pattern.exec(haystack);
  return match ? match.index : -1;
}

function isNegated(text: string, at: number): boolean {
  const window = text.slice(Math.max(0, at - NEGATION_WINDOW), at).toLowerCase();
  return NEGATORS.some((negator) => findPhrase(window, negator) !== -1);
}

export interface PhraseHit {
  phrase: Phrase;
  at: number;
}

/**
 * Returns the phrases present in the text, skipping negated occurrences.
 * "not looking for buyers" must not read as buyer intent.
 */
export function matchPhrases(text: string, phrases: Phrase[]): PhraseHit[] {
  const hits: PhraseHit[] = [];
  for (const phrase of phrases) {
    const at = findPhrase(text, phrase.text);
    if (at === -1) continue;
    if (isNegated(text, at)) continue;
    hits.push({ phrase, at });
  }
  return hits;
}

export function extractPropertyTypes(text: string): string[] {
  const found = new Set<string>();
  for (const [type, terms] of Object.entries(PROPERTY_TYPE_TERMS)) {
    if (terms.some((term) => findPhrase(text, term) !== -1)) found.add(type);
  }
  return [...found];
}

export function canonicalLocation(value: string): string {
  const key = value.trim().toLowerCase();
  return LOCATION_ALIASES[key] ?? key;
}

export function extractLocations(text: string, locationRaw?: string | null): string[] {
  const found = new Set<string>();

  for (const location of BALI_LOCATIONS) {
    if (findPhrase(text, location) !== -1) found.add(canonicalLocation(location));
  }

  // The structured `location` field ("Denpasar, Bali") is more reliable than
  // scanning prose, so it is always trusted when present.
  if (locationRaw) {
    for (const part of locationRaw.split(",")) {
      const canonical = canonicalLocation(part);
      if (canonical && canonical.length > 2) found.add(canonical);
    }
  }

  // "bali" alone is noise once a district is known.
  if (found.size > 1) found.delete("bali");
  return [...found];
}

// ---------------------------------------------------------------------------
// Contact extraction
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const WHATSAPP_LINK_PATTERN = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d{8,15})/i;
const WHATSAPP_LABEL_PATTERN = /(?:whatsapp|wa|w\.a)[\s:.]*(\+?[\d\s().-]{8,20})/i;
const PHONE_CANDIDATE_PATTERN = /\+?\d[\d\s().-]{7,19}\d/g;

/**
 * Phone extraction via libphonenumber rather than a hand-rolled regex. A loose
 * regex reliably captures dates, prices and post ids as "phone numbers", and a
 * bad number sends an agent to a stranger.
 */
function validatePhone(candidate: string): string | null {
  const parsed = parsePhoneNumberFromString(candidate, "ID");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/**
 * Removes the number-shaped text that is definitively not a phone number before
 * scanning. libphonenumber will happily validate `2026-01-08` as an Indonesian
 * number, and a wrong number sends an agent to a stranger.
 */
function stripNonPhoneNumerics(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/g, " ") // ISO dates
    .replace(/\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/g, " ") // 08/01/2026
    .replace(/(?:IDR|Rp\.?|USD|US\$|\$|€|AUD)\s?[\d.,]+/gi, " ") // prices
    .replace(/\d[\d.,]*\s?(?:jt|juta|rb|ribu|miliar|milyar|million|billion|k\b|m\b)/gi, " ")
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, " "); // 2,500,000,000
}

export function extractContact(text: string): ContactInfo {
  const email = EMAIL_PATTERN.exec(text)?.[0] ?? null;

  let whatsapp: string | null = null;
  const link = WHATSAPP_LINK_PATTERN.exec(text);
  if (link) whatsapp = validatePhone(link[1]);
  if (!whatsapp) {
    const labelled = WHATSAPP_LABEL_PATTERN.exec(text);
    if (labelled) whatsapp = validatePhone(labelled[1]);
  }

  const scannable = stripNonPhoneNumerics(text);

  let phone: string | null = null;
  for (const match of scannable.matchAll(PHONE_CANDIDATE_PATTERN)) {
    const valid = validatePhone(match[0]);
    if (valid) {
      phone = valid;
      break;
    }
  }

  // Deliberately no phone -> whatsapp fallback. Asserting a WhatsApp number the
  // poster never gave is how an agent ends up messaging a wrong number.
  return { phone, email, whatsapp };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

const BUDGET_PATTERNS: { pattern: RegExp; currency: "USD" | "IDR" | null }[] = [
  { pattern: /(?:USD|US\$|\$)\s?([\d.,]+\s?(?:k|m|mn|million|b|billion)?)/gi, currency: "USD" },
  { pattern: /(?:IDR|Rp\.?)\s?([\d.,]+\s?(?:jt|juta|rb|ribu|m|miliar|milyar|b)?)/gi, currency: "IDR" },
  { pattern: /([\d.,]+\s?(?:k|m|jt|juta|miliar|milyar|b|billion|million))\s?(USD|IDR|\$|Rp)/gi, currency: null },
];

export function extractBudget(text: string, priceRaw?: string | null): BudgetRange | null {
  const amounts: { value: number; currency: string }[] = [];

  for (const { pattern, currency } of BUDGET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = parseMoney(match[1]);
      if (value === null || value <= 0) continue;
      const resolved =
        currency ?? (/IDR|Rp/i.test(match[2] ?? "") ? "IDR" : "USD");
      amounts.push({ value, currency: resolved });
    }
  }

  // The structured price field, when present, is authoritative over prose.
  if (priceRaw) {
    const value = parseMoney(priceRaw);
    if (value !== null && value > 0) {
      amounts.unshift({ value, currency: /IDR|Rp/i.test(priceRaw) ? "IDR" : "USD" });
    }
  }

  if (amounts.length === 0) return null;

  const currency = amounts[0].currency;
  const sameCurrency = amounts.filter((a) => a.currency === currency).map((a) => a.value);
  return {
    min: Math.min(...sameCurrency),
    max: Math.max(...sameCurrency),
    currency,
  };
}

export function extractBedrooms(text: string): number | null {
  const match = /(\d+)\s*(?:bed|beds|bedroom|bedrooms|br|kamar tidur|kt)\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

export function extractBathrooms(text: string): number | null {
  const match = /(\d+)\s*(?:bath|baths|bathroom|bathrooms|kamar mandi)\b/i.exec(text);
  return match ? Number(match[1]) : null;
}
