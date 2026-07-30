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
