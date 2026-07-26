import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  parseLeadFilters,
  serializeLeadFilters,
  type LeadFilters,
} from "./filters.schema";

describe("parseLeadFilters", () => {
  it("applies schema defaults for an empty query string", () => {
    expect(parseLeadFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });

  it("lifts attr.* keys into the attr map, leaving the rest at the top level", () => {
    const filters = parseLeadFilters(
      new URLSearchParams("intent=buyer&attr.paidPartnership=true&attr.campaign=spring"),
    );
    expect(filters.intent).toEqual(["buyer"]);
    expect(filters.attr).toEqual({ paidPartnership: "true", campaign: "spring" });
  });

  it("splits a comma-joined multi-select value", () => {
    const filters = parseLeadFilters(new URLSearchParams("intent=buyer,seller"));
    expect(filters.intent).toEqual(["buyer", "seller"]);
  });

  it("drops a value that fails schema validation rather than throwing", () => {
    // datasetId must be a UUID — a hand-edited query string shouldn't 500 the page.
    expect(() => parseLeadFilters(new URLSearchParams("datasetId=not-a-uuid"))).toThrow();
  });
});

describe("serializeLeadFilters", () => {
  it("round-trips the default filters back to an empty query string", () => {
    expect(serializeLeadFilters(DEFAULT_FILTERS).toString()).toBe("");
  });

  it("round-trips a representative filter set exactly through parseLeadFilters", () => {
    const filters: LeadFilters = {
      ...DEFAULT_FILTERS,
      q: "villa canggu",
      datasetId: "123e4567-e89b-12d3-a456-426614174000",
      intent: ["buyer", "agent"],
      status: ["new"],
      recordKind: ["engagement_like"],
      propertyTypes: ["villa"],
      locations: [],
      groups: [],
      minIntent: 60,
      hasContact: true,
      includeSpam: false,
      sort: "newest",
      view: "cards",
      page: 3,
      pageSize: 50,
      attr: { paidPartnership: "true" },
    };

    const roundTripped = parseLeadFilters(serializeLeadFilters(filters));
    expect(roundTripped).toEqual(filters);
  });

  it("omits fields that equal the schema default, keeping the URL short", () => {
    const params = serializeLeadFilters({ ...DEFAULT_FILTERS, q: "villa" });
    expect(params.toString()).toBe("q=villa");
  });

  it("never emits an empty array for an unset multi-select filter", () => {
    const params = serializeLeadFilters(DEFAULT_FILTERS);
    expect(params.has("intent")).toBe(false);
    expect(params.has("propertyTypes")).toBe(false);
  });
});
