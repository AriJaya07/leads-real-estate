import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Classification } from "@/domain/scoring/types";

const mockServerEnv = vi.fn();
vi.mock("@/shared/config/env", () => ({ serverEnv: () => mockServerEnv() }));

const mockClassify = vi.fn();
vi.mock("@/infrastructure/ai/llm-classifier", () => ({
  llmClassifier: { id: "llm@shadow-1", classify: (...args: unknown[]) => mockClassify(...args) },
}));

const { runShadowClassification } = await import("./shadow-classify");

const rulesResult: Classification = {
  intent: "buyer",
  intentScore: 70,
  qualityScore: 50,
  investorScore: 0,
  brokerScore: 0,
  reach: 0,
  isSpam: false,
  propertyTypes: [],
  locations: [],
  budget: null,
  contact: {},
  bedrooms: null,
  bathrooms: null,
  reasons: [],
  classifierId: "rules@2",
  classifiedAt: new Date().toISOString(),
};

describe("runShadowClassification", () => {
  beforeEach(() => {
    mockClassify.mockReset();
    mockServerEnv.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("does nothing when the flag is off — zero network calls by default", () => {
    mockServerEnv.mockReturnValue({ LLM_SHADOW_CLASSIFY_ENABLED: undefined, ANTHROPIC_API_KEY: "sk-test" });
    runShadowClassification({ body: "x" }, rulesResult);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it("does nothing when the API key is missing, even if the flag is on", () => {
    mockServerEnv.mockReturnValue({ LLM_SHADOW_CLASSIFY_ENABLED: "true", ANTHROPIC_API_KEY: undefined });
    runShadowClassification({ body: "x" }, rulesResult);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it("fires the LLM classifier when both the flag and the key are set", () => {
    mockServerEnv.mockReturnValue({ LLM_SHADOW_CLASSIFY_ENABLED: "true", ANTHROPIC_API_KEY: "sk-test" });
    mockClassify.mockResolvedValue({ intent: "buyer", intentScore: 80 });
    runShadowClassification({ body: "x" }, rulesResult);
    expect(mockClassify).toHaveBeenCalledWith({ body: "x" });
  });

  it("never throws synchronously, and a rejected shadow call doesn't propagate", async () => {
    mockServerEnv.mockReturnValue({ LLM_SHADOW_CLASSIFY_ENABLED: "true", ANTHROPIC_API_KEY: "sk-test" });
    mockClassify.mockRejectedValue(new Error("boom"));
    expect(() => runShadowClassification({ body: "x" }, rulesResult)).not.toThrow();
    // Let the rejected promise's .catch() handler run before the test exits.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
