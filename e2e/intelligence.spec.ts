import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("intelligence dashboard", () => {
  test("shows aggregate stats, the trend chart and the intent breakdown for the seeded lead", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await loginAsAdmin(page);
    await page.goto("/intelligence");

    await expect(page.getByRole("heading", { name: "Intelligence" })).toBeVisible();

    // Overview stats: the one seeded lead is a buyer. `exact: true` matters —
    // the "Buyer leads" tile's own hint text ("Of total leads") otherwise
    // substring-matches the "Total leads" label too.
    const totalTile = page.getByText("Total leads", { exact: true }).locator("..");
    await expect(totalTile.getByText("1", { exact: true })).toBeVisible();

    const buyerTile = page.getByText("Buyer leads", { exact: true }).locator("..");
    await expect(buyerTile.getByText("1", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "New leads, last 30 days" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Lead type" })).toBeVisible();
    await expect(page.getByText("Buyer", { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
