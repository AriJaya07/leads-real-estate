import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("not-found", () => {
  test("an unmatched URL shows the branded 404, not a crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/this-route-does-not-exist");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to inbox" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("previously-404 nav destinations now render a real page", () => {
  for (const [path, heading] of [
    ["/pipeline", "Pipeline"],
    ["/intelligence", "Intelligence"],
    ["/admin/sync", "Sync activity"],
  ] as const) {
    test(`${path} renders instead of 404ing`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await loginAsAdmin(page);
      await page.goto(path);

      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
