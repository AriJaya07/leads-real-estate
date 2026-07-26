import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("sync activity", () => {
  test("a triggered run shows up in the cross-dataset feed and its log is viewable from the dataset detail page", async ({
    page,
  }) => {
    // Triggers its own run rather than relying on another spec file having run
    // first — the same real-connector-failure path dataset-sync.spec.ts uses
    // (placeholder Apify token, nonexistent externalId), which is what leaves
    // a "failed" sync_runs row with real log lines behind for this test.
    await loginAsAdmin(page);
    await page.goto("/admin/datasets");
    const row = page.getByRole("row", { name: /e2e-nonexistent-dataset/ });
    await row.getByRole("button", { name: /^Sync/ }).click();
    await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/sync");
    await expect(page.getByRole("heading", { name: "Sync activity" })).toBeVisible();

    const runRow = page.getByRole("row").filter({ hasText: "Failed" }).first();
    await expect(runRow).toBeVisible();

    await runRow.getByRole("link", { name: "View run log" }).click();
    await expect(page).toHaveURL(/\/admin\/sync\/.+\?run=/);

    await expect(page.getByRole("heading", { name: "Run log" })).toBeVisible();
    // SyncLogger always writes a "start" line before anything can fail.
    await expect(page.getByText("Sync started", { exact: false })).toBeVisible();

    // Dataset actions and settings render even for a dataset that's never
    // successfully synced (no schema/mapping captured yet).
    await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
    await expect(page.getByText("No mapping profile yet", { exact: false })).toBeVisible();
  });
});
