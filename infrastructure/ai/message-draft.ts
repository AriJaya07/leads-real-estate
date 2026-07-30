import "server-only";
import { callAnthropicText } from "./anthropic-client";

export type MessageDraftMode = "first_contact" | "follow_up";

export interface MessageDraftInput {
  mode: MessageDraftMode;
  propertyTypes: string[];
  locations: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  /** The lead's own most relevant post/comment text, if any — anchors tone/language/specifics. */
  latestBody: string | null;
  /** Only meaningful for `mode: "follow_up"`. */
  status?: string;
  daysSinceLastContact?: number;
}

function budgetLine(input: MessageDraftInput): string {
  if (input.budgetMin === null && input.budgetMax === null) return "";
  return `Stated budget: ${input.budgetCurrency ?? ""} ${input.budgetMin ?? "?"}-${input.budgetMax ?? "?"}`.trim();
}

function buildPrompt(input: MessageDraftInput): string {
  const intro =
    input.mode === "first_contact"
      ? "Draft a short first WhatsApp message from a Bali real-estate agent to this lead, who has never been contacted before."
      : `Draft a brief, natural WhatsApp follow-up message. It has been ${
          input.daysSinceLastContact ?? "a few"
        } day(s) since the last contact; the lead's current pipeline status is "${input.status ?? "contacted"}".`;

  return [
    intro,
    "Write in the SAME language as the lead's own text below — default to English only if no text is given. Keep it under 60 words, friendly and specific, not salesy or generic ('Dear Sir/Madam' is forbidden). Reference something concrete from what they said if possible. End with a soft, easy-to-answer question, not a hard sell.",
    "Output ONLY the message text itself — no quotes around it, no explanation, no options to choose from.",
    "",
    `Lead's own words: ${input.latestBody ? `"${input.latestBody.slice(0, 400)}"` : "(none available — they liked or commented on a listing without their own text)"}`,
    `They're interested in: ${input.propertyTypes.join(", ") || "property"} in ${input.locations.join(", ") || "Bali"}`,
    budgetLine(input),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateMessageDraft(apiKey: string, input: MessageDraftInput): Promise<string> {
  const text = await callAnthropicText({ apiKey, prompt: buildPrompt(input), maxTokens: 200 });
  return text.trim();
}
