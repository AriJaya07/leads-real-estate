import "server-only";
import { callAnthropicText, DEFAULT_ANTHROPIC_MODEL } from "./anthropic-client";

export interface LeadSummarySignal {
  body: string;
  scoreReasons: string[];
}

export interface LeadSummaryInput {
  name: string | null;
  leadType: string;
  buyerScore: number;
  sellerScore: number;
  investorScore: number;
  confidenceScore: number;
  dataQualityTier: string;
  propertyTypes: string[];
  locations: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  hasContact: boolean;
  appearanceCount: number;
  /** Top few signals (post/comment text + why they scored), most relevant first. */
  signals: LeadSummarySignal[];
}

function budgetLine(input: LeadSummaryInput): string {
  if (input.budgetMin === null && input.budgetMax === null) return "Budget: not stated";
  return `Budget: ${input.budgetCurrency ?? ""} ${input.budgetMin ?? "?"}-${input.budgetMax ?? "?"}`.trim();
}

function buildPrompt(input: LeadSummaryInput): string {
  return [
    "You are helping a Bali real-estate sales agent quickly understand a lead before they contact them.",
    "Write a concise 2-4 sentence summary in plain English: who they are, what they're looking for, how strong/urgent this opportunity is, and one concrete angle for the agent's first message.",
    "No headers, no bullet points, no markdown formatting — plain prose an agent can read in five seconds. Do not invent facts not present below.",
    "",
    `Name: ${input.name ?? "Unknown"}`,
    `Classified as: ${input.leadType} (buyer score ${input.buyerScore}, seller score ${input.sellerScore}, investor score ${input.investorScore}, confidence ${input.confidenceScore})`,
    `Data quality: ${input.dataQualityTier}`,
    `Interested in: ${input.propertyTypes.join(", ") || "unspecified property type"} in ${
      input.locations.join(", ") || "an unspecified location"
    }`,
    budgetLine(input),
    `Contactable directly: ${input.hasContact ? "yes" : "no"}`,
    `Seen ${input.appearanceCount} time(s) across sources.`,
    "",
    input.signals.length > 0 ? "What they've posted/engaged with, most relevant first:" : "No post text available.",
    ...input.signals.map(
      (s, i) => `${i + 1}. "${s.body.slice(0, 300)}"${s.scoreReasons.length ? ` (signals: ${s.scoreReasons.join(", ")})` : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface LeadSummaryResult {
  summary: string;
  model: string;
}

export async function generateLeadSummary(apiKey: string, input: LeadSummaryInput): Promise<LeadSummaryResult> {
  const text = await callAnthropicText({ apiKey, prompt: buildPrompt(input), maxTokens: 300 });
  return { summary: text.trim(), model: DEFAULT_ANTHROPIC_MODEL };
}
