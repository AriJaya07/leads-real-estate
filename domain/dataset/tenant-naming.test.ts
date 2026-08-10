import { describe, expect, it } from "vitest";
import { tenantDatasetPrefix } from "./tenant-naming";

describe("tenantDatasetPrefix", () => {
  it("prefixes the brand and the company slug so two companies never produce the same prefix", () => {
    expect(tenantDatasetPrefix("bukit-villa-partners")).toBe("averonai-bukit-villa-partners-");
    expect(tenantDatasetPrefix("nihongo")).not.toBe(tenantDatasetPrefix("bukit-villa-partners"));
  });

  it("is a plain string transform — same slug always produces the same prefix", () => {
    expect(tenantDatasetPrefix("dreamrue")).toBe(tenantDatasetPrefix("dreamrue"));
  });
});
