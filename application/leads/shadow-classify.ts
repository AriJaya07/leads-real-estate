import "server-only";
import type { ClassifierInput, Classification } from "@/domain/scoring/types";
import { llmClassifier } from "@/infrastructure/ai/llm-classifier";
import { serverEnv } from "@/shared/config/env";
import { createLogger } from "@/infrastructure/observability/logger";

const log = createLogger("classify:shadow");

function shadowClassifyEnabled(): boolean {
  return (
    serverEnv().LLM_SHADOW_CLASSIFY_ENABLED?.toLowerCase() === "true" &&
    Boolean(serverEnv().ANTHROPIC_API_KEY)
  );
}

/**
 * Fires an LLM classification alongside the real rules-based one, purely for
 * comparison logging — never awaited by the caller, never affects a persisted
 * `lead_appearances` row. Per architecture.md/prd.md: the rules classifier is
 * the only thing that determines a lead's actual score until an LLM
 * implementation is validated in shadow mode first; this is that shadow mode,
 * not a cutover mechanism (there isn't one).
 *
 * A no-op unless both `LLM_SHADOW_CLASSIFY_ENABLED` and `ANTHROPIC_API_KEY`
 * are set — zero network calls otherwise, so every existing deployment is
 * unaffected by default.
 */
export function runShadowClassification(input: ClassifierInput, rulesResult: Classification): void {
  if (!shadowClassifyEnabled()) return;

  void llmClassifier
    .classify(input)
    .then((llmResult) => {
      log.info("shadow classification", {
        rulesIntent: rulesResult.intent,
        rulesIntentScore: rulesResult.intentScore,
        llmIntent: llmResult.intent,
        llmIntentScore: llmResult.intentScore,
        agree: rulesResult.intent === llmResult.intent,
      });
    })
    .catch((error) => {
      log.warn("shadow classification failed", { error: error instanceof Error ? error.message : String(error) });
    });
}
