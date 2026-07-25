import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("admin dataset sync", () => {
  test("triggering a manual sync against an unreachable dataset surfaces a failure toast", async ({
    page,
  }) => {
    // No mocking of Apify here on purpose: APIFY_API_TOKEN in .env.e2e is a
    // placeholder, and the seeded dataset's externalId doesn't exist upstream —
    // this exercises the real connector's error path end to end (auth failure /
    // 404), not a simulated one, which is what actually proves the admin UI's
    // error handling works against the real integration.
    await loginAsAdmin(page);
    await page.goto("/admin/datasets");

    const row = page.getByRole("row", { name: /e2e-nonexistent-dataset/ });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /^Sync/ }).click();

    await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 15_000 });
  });
});
