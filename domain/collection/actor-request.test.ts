import { describe, expect, it } from "vitest";
import { buildActorInput, paramsFingerprint, toScrapeRequestStatus } from "./actor-request";

describe("buildActorInput", () => {
  const template = {
    actorId: "apify/instagram-scraper",
    defaultInput: { resultsType: "posts", resultsLimit: 50 },
    requiredParams: ["directUrls"],
  };

  it("merges default input with user params", () => {
    const result = buildActorInput(template, { directUrls: ["https://instagram.com/x"] });
    expect(result.ok).toBe(true);
    expect(result.input).toEqual({
      resultsType: "posts",
      resultsLimit: 50,
      directUrls: ["https://instagram.com/x"],
    });
  });

  it("lets user params override the template default", () => {
    const result = buildActorInput(template, {
      directUrls: ["https://instagram.com/x"],
      resultsLimit: 200,
    });
    expect(result.input.resultsLimit).toBe(200);
  });

  it("flags missing required params without building a network-ready input", () => {
    const result = buildActorInput(template, { resultsLimit: 10 });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["directUrls"]);
  });

  it("treats an empty-string or null required param as missing", () => {
    expect(buildActorInput(template, { directUrls: "" }).missing).toEqual(["directUrls"]);
    expect(buildActorInput(template, { directUrls: null }).missing).toEqual(["directUrls"]);
  });
});

describe("buildActorInput with paramSchema", () => {
  const schemaTemplate = {
    actorId: "REPLACE_WITH_REAL_ACTOR_ID",
    defaultInput: { language: "en" },
    requiredParams: ["searchQuery", "location"],
    paramSchema: [
      { key: "searchQuery", label: "What to search for", type: "text" as const, required: true },
      { key: "location", label: "Location", type: "text" as const, required: true },
      { key: "radiusKm", label: "Radius", type: "number" as const, required: false },
      { key: "categories", label: "Categories", type: "multiselect" as const, required: false },
    ],
  };

  it("validates required fields from the schema, not just requiredParams presence", () => {
    const result = buildActorInput(schemaTemplate, { searchQuery: "villas" });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["location"]);
  });

  it("coerces a number field from a string input", () => {
    const result = buildActorInput(schemaTemplate, { searchQuery: "villas", location: "Bali", radiusKm: "5" });
    expect(result.ok).toBe(true);
    expect(result.input.radiusKm).toBe(5);
  });

  it("treats a non-numeric value for a required number field as missing", () => {
    const numericRequired = {
      ...schemaTemplate,
      paramSchema: schemaTemplate.paramSchema.map((f) => (f.key === "radiusKm" ? { ...f, required: true } : f)),
    };
    const result = buildActorInput(numericRequired, { searchQuery: "villas", location: "Bali", radiusKm: "not-a-number" });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("radiusKm");
  });

  it("wraps a bare multiselect value into an array", () => {
    const result = buildActorInput(schemaTemplate, { searchQuery: "villas", location: "Bali", categories: "hotel" });
    expect(result.input.categories).toEqual(["hotel"]);
  });

  it("treats an empty array for an optional multiselect as absent, not an error", () => {
    const result = buildActorInput(schemaTemplate, { searchQuery: "villas", location: "Bali", categories: [] });
    expect(result.ok).toBe(true);
    expect(result.input.categories).toBeUndefined();
  });

  it("splits a tags field's comma/newline text into a trimmed array", () => {
    const tagsTemplate = {
      ...schemaTemplate,
      paramSchema: [...schemaTemplate.paramSchema, { key: "keywords", label: "Keywords", type: "tags" as const, required: false }],
    };
    const result = buildActorInput(tagsTemplate, {
      searchQuery: "villas",
      location: "Bali",
      keywords: "villa, land\nvilla for sale ,  \n",
    });
    expect(result.input.keywords).toEqual(["villa", "land", "villa for sale"]);
  });

  it("treats a required tags field with no non-empty entries as missing", () => {
    const tagsTemplate = {
      ...schemaTemplate,
      paramSchema: [...schemaTemplate.paramSchema, { key: "keywords", label: "Keywords", type: "tags" as const, required: true }],
    };
    const result = buildActorInput(tagsTemplate, { searchQuery: "villas", location: "Bali", keywords: " , \n " });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("keywords");
  });

  it("merges coerced params under defaultInput", () => {
    const result = buildActorInput(schemaTemplate, { searchQuery: "villas", location: "Bali" });
    expect(result.input.language).toBe("en");
  });

  it("falls back to requiredParams-only validation when paramSchema is empty", () => {
    const legacy = { actorId: "x", defaultInput: {}, requiredParams: ["startUrls"], paramSchema: [] };
    expect(buildActorInput(legacy, {}).missing).toEqual(["startUrls"]);
    expect(buildActorInput(legacy, { startUrls: "https://x" }).ok).toBe(true);
  });
});

describe("paramsFingerprint", () => {
  it("is stable regardless of key order", () => {
    expect(paramsFingerprint({ a: 1, b: 2 })).toBe(paramsFingerprint({ b: 2, a: 1 }));
  });

  it("differs when a value differs", () => {
    expect(paramsFingerprint({ a: 1 })).not.toBe(paramsFingerprint({ a: 2 }));
  });
});

describe("toScrapeRequestStatus", () => {
  it("collapses in-flight Apify states onto running", () => {
    expect(toScrapeRequestStatus("READY")).toBe("running");
    expect(toScrapeRequestStatus("RUNNING")).toBe("running");
    expect(toScrapeRequestStatus("TIMING-OUT")).toBe("running");
    expect(toScrapeRequestStatus("ABORTING")).toBe("running");
  });

  it("maps terminal states 1:1", () => {
    expect(toScrapeRequestStatus("SUCCEEDED")).toBe("succeeded");
    expect(toScrapeRequestStatus("FAILED")).toBe("failed");
    expect(toScrapeRequestStatus("ABORTED")).toBe("aborted");
    expect(toScrapeRequestStatus("TIMED-OUT")).toBe("timed_out");
  });
});
