import "server-only";
import type { ClassifierInput, Classification, LeadClassifier, LeadIntent } from "@/domain/scoring/types";
import { serverEnv } from "@/shared/config/env";

/**
 * Shadow-mode LLM classifier — the `LeadClassifier` port's second
 * implementation, per architecture.md's "adding an LLM classifier later a
 * backfill job, not a migration" design. Does real network I/O, so unlike the
 * pure/sync `domain/scoring/rules-classifier.ts` this lives in
 * `infrastructure/`, not `domain/`.
 *
 * Never selected as the primary classifier anywhere — `application/leads/process-records.ts`
 * still persists only `classifyWithRules`'s output. The one caller
 * (`application/leads/shadow-classify.ts`) uses this purely for comparison
 * logging, and is designed to catch whatever this throws.
 */
export const LLM_CLASSIFIER_ID = "llm@shadow-1";

const MODEL = "claude-haiku-4-5-20251001";
const VALID_INTENTS: readonly LeadIntent[] = ["buyer", "seller", "agent", "other"];

function clampScore(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function buildPrompt(input: ClassifierInput): string {
  return [
    "Classify this Bali real-estate lead appearance. Respond with ONLY a JSON object,",
    "no prose, matching exactly this shape:",
    `{"intent":"buyer"|"seller"|"agent"|"other","intentScore":0-100,"qualityScore":0-100,`,
    `"investorScore":0-100,"brokerScore":0-100,"isSpam":boolean,"propertyTypes":string[],`,
    `"locations":string[],"reasons":[{"code":string,"label":string,"weight":number,"evidence"?:string}]}`,
    "",
    `Body: ${input.body || "(empty — engagement record, no body text)"}`,
    input.listingTitle ? `Listing title: ${input.listingTitle}` : "",
    input.locationRaw ? `Location: ${input.locationRaw}` : "",
    input.priceRaw ? `Price: ${input.priceRaw}` : "",
    input.sourceGroup ? `Source group: ${input.sourceGroup}` : "",
    input.recordKind ? `Record kind: ${input.recordKind}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function callAnthropic(apiKey: string, prompt: string): Promise<unknown> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Anthropic API ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Anthropic response had no text content block");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Anthropic response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

export const llmClassifier: LeadClassifier = {
  id: LLM_CLASSIFIER_ID,
  async classify(input: ClassifierInput): Promise<Classification> {
    const apiKey = serverEnv().ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const raw = await callAnthropic(apiKey, buildPrompt(input));
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Anthropic response was not a JSON object");
    }
    const parsed = raw as Record<string, unknown>;
    const intent = VALID_INTENTS.includes(parsed.intent as LeadIntent)
      ? (parsed.intent as LeadIntent)
      : "other";

    return {
      intent,
      intentScore: clampScore(parsed.intentScore),
      qualityScore: clampScore(parsed.qualityScore),
      investorScore: clampScore(parsed.investorScore),
      brokerScore: clampScore(parsed.brokerScore),
      reach: 0,
      isSpam: Boolean(parsed.isSpam),
      propertyTypes: stringArray(parsed.propertyTypes),
      locations: stringArray(parsed.locations),
      budget: null,
      contact: {},
      bedrooms: null,
      bathrooms: null,
      reasons: Array.isArray(parsed.reasons) ? (parsed.reasons as Classification["reasons"]) : [],
      classifierId: LLM_CLASSIFIER_ID,
      classifiedAt: new Date().toISOString(),
    };
  },
};
