import "server-only";
import { createLogger } from "@/infrastructure/observability/logger";

/**
 * Low-level Anthropic Messages API call — the one place that owns the HTTP
 * request shape, shared by every LLM-assisted feature under `infrastructure/ai/`
 * (the shadow classifier, lead summaries, message drafts). Callers own their
 * own prompt construction and response parsing (JSON for the classifier,
 * prose for summaries/drafts); this only knows how to get text back from the
 * API and surface a real error if that fails.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const log = createLogger("ai:anthropic-client");

export interface AnthropicCallOptions {
  apiKey: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export async function callAnthropicText(options: AnthropicCallOptions): Promise<string> {
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 512,
        messages: [{ role: "user", content: options.prompt }],
      }),
    });
  } catch (error) {
    log.error("anthropic request failed", { model, durationMs: Date.now() - startedAt, error: String(error) });
    throw error;
  }

  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log.error("anthropic response not ok", { model, durationMs, status: response.status });
    throw new Error(`Anthropic API ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    log.error("anthropic response had no text block", { model, durationMs });
    throw new Error("Anthropic response had no text content block");
  }

  log.info("anthropic call completed", { model, durationMs });
  return text;
}
