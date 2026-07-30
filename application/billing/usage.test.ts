import { describe, expect, it } from "vitest";
import { currentMonthBounds } from "./usage";

describe("currentMonthBounds", () => {
  it("returns the first and last day of the month, UTC", () => {
    const { start, end } = currentMonthBounds(new Date("2026-07-15T23:00:00Z"));
    expect(start).toBe("2026-07-01");
    expect(end).toBe("2026-07-31");
  });

  it("handles a 30-day month correctly", () => {
    const { end } = currentMonthBounds(new Date("2026-04-10T00:00:00Z"));
    expect(end).toBe("2026-04-30");
  });

  it("handles February in a leap year", () => {
    const { end } = currentMonthBounds(new Date("2028-02-01T00:00:00Z"));
    expect(end).toBe("2028-02-29");
  });

  it("handles February in a non-leap year", () => {
    const { end } = currentMonthBounds(new Date("2026-02-01T00:00:00Z"));
    expect(end).toBe("2026-02-28");
  });

  it("handles December correctly (year rollover for the next-month calculation)", () => {
    const { start, end } = currentMonthBounds(new Date("2026-12-25T00:00:00Z"));
    expect(start).toBe("2026-12-01");
    expect(end).toBe("2026-12-31");
  });
});
