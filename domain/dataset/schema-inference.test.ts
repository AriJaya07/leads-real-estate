import { describe, expect, it } from "vitest";
import { diffSchema, fingerprintSchema, inferSchema, isSchemaDrift } from "./schema-inference";

describe("inferSchema", () => {
  it("discovers nested and array paths", () => {
    const profiles = inferSchema([
      { user: { name: "Hi Taka" }, attachments: [{ photo_image: { uri: "https://x/1.jpg" } }] },
    ]);
    const paths = profiles.map((p) => p.path);

    expect(paths).toContain("user.name");
    expect(paths).toContain("attachments[].photo_image.uri");
  });

  /**
   * Regression: presence used to be counted per array element, so a payload with
   * six attachments reported a 6.0 fill rate for `attachments[].ocrText`. That
   * inflated score beat the real `text` field during mapping proposal and
   * silently mapped post bodies to image alt text.
   */
  it("never reports a fill rate above 1 for repeated array paths", () => {
    const profiles = inferSchema([
      {
        text: "a real post body",
        attachments: [{ ocrText: "alt 1" }, { ocrText: "alt 2" }, { ocrText: "alt 3" }],
      },
    ]);

    const ocr = profiles.find((p) => p.path === "attachments[].ocrText");
    const text = profiles.find((p) => p.path === "text");

    expect(ocr?.fillRate).toBeLessThanOrEqual(1);
    expect(text?.fillRate).toBe(1);
  });

  it("computes fill rate across records, not occurrences", () => {
    const profiles = inferSchema([{ title: "present" }, {}, {}, {}]);
    expect(profiles.find((p) => p.path === "title")?.fillRate).toBe(0.25);
  });

  it("does not treat arbitrary strings as dates", () => {
    const profiles = inferSchema([{ title: "Villa 3", time: "2026-01-08T18:08:53.000Z" }]);
    expect(profiles.find((p) => p.path === "title")?.type).toBe("string");
    expect(profiles.find((p) => p.path === "time")?.type).toBe("date");
  });
});

describe("fingerprintSchema", () => {
  it("is stable regardless of sample order and value changes", () => {
    const a = inferSchema([{ b: 1, a: "x" }]);
    const b = inferSchema([{ a: "different", b: 99 }]);
    expect(fingerprintSchema(a)).toBe(fingerprintSchema(b));
  });

  it("changes when a field appears", () => {
    const before = inferSchema([{ a: "x" }]);
    const after = inferSchema([{ a: "x", b: "y" }]);
    expect(fingerprintSchema(before)).not.toBe(fingerprintSchema(after));
  });
});

describe("diffSchema / isSchemaDrift", () => {
  it("treats added fields as safe but removals as drift", () => {
    const before = inferSchema([{ a: "x", b: "y" }]);
    const added = inferSchema([{ a: "x", b: "y", c: "z" }]);
    const removed = inferSchema([{ a: "x" }]);

    expect(isSchemaDrift(diffSchema(before, added))).toBe(false);
    expect(isSchemaDrift(diffSchema(before, removed))).toBe(true);
    expect(diffSchema(before, removed).removed).toContain("b");
  });
});
