import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockServerEnv = vi.fn();
vi.mock("@/shared/config/env", () => ({ serverEnv: () => mockServerEnv() }));

// Imported after the mock is registered so the mocked `serverEnv` is what
// `llm-classifier.ts` picks up.
const { llmClassifier, LLM_CLASSIFIER_ID } = await import("./llm-classifier");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("llmClassifier", () => {
  beforeEach(() => {
    mockServerEnv.mockReturnValue({ ANTHROPIC_API_KEY: undefined });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("throws when ANTHROPIC_API_KEY is not configured, without calling fetch", async () => {
    await expect(llmClassifier.classify({ body: "looking to buy a villa" })).rejects.toThrow(
      "ANTHROPIC_API_KEY not configured",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a well-formed response into a valid Classification", async () => {
    mockServerEnv.mockReturnValue({ ANTHROPIC_API_KEY: "sk-test" });
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              intent: "buyer",
              intentScore: 82,
              qualityScore: 60,
              investorScore: 0,
              brokerScore: 0,
              isSpam: false,
              propertyTypes: ["villa"],
              locations: ["Canggu"],
              reasons: [{ code: "explicit_intent", label: "states intent to buy", weight: 40 }],
            }),
          },
        ],
      }),
    );

    const result = await llmClassifier.classify({ body: "looking to buy a villa in Canggu" });

    expect(result.intent).toBe("buyer");
    expect(result.intentScore).toBe(82);
    expect(result.propertyTypes).toEqual(["villa"]);
    expect(result.locations).toEqual(["Canggu"]);
    expect(result.classifierId).toBe(LLM_CLASSIFIER_ID);
    expect(result.reach).toBe(0);
    expect(result.budget).toBeNull();
  });

  it("clamps out-of-range scores and falls back to 'other' for an invalid intent", async () => {
    mockServerEnv.mockReturnValue({ ANTHROPIC_API_KEY: "sk-test" });
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        content: [
          {
            type: "text",
            text: JSON.stringify({ intent: "not-a-real-intent", intentScore: 500, qualityScore: -10 }),
          },
        ],
      }),
    );

    const result = await llmClassifier.classify({ body: "..." });

    expect(result.intent).toBe("other");
    expect(result.intentScore).toBe(100);
    expect(result.qualityScore).toBe(0);
  });

  it("throws when the response text isn't valid JSON", async () => {
    mockServerEnv.mockReturnValue({ ANTHROPIC_API_KEY: "sk-test" });
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ content: [{ type: "text", text: "not json at all" }] }),
    );

    await expect(llmClassifier.classify({ body: "..." })).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the Anthropic API responds with a non-2xx status", async () => {
    mockServerEnv.mockReturnValue({ ANTHROPIC_API_KEY: "sk-test" });
    vi.mocked(fetch).mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(llmClassifier.classify({ body: "..." })).rejects.toThrow("Anthropic API 429");
  });
});
