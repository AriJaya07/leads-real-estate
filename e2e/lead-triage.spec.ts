import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";
import { E2E_LEAD_AUTHOR } from "./global-setup";

test.describe("lead triage", () => {
  test("shows the seeded buyer lead and marks it contacted via the original-post action", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/leads");

    const row = page.getByRole("row", { name: new RegExp(E2E_LEAD_AUTHOR) });
    await expect(row).toBeVisible();
    // Freshly seeded, untouched — no status pill rendered yet.
    await expect(row.getByText("contacted", { exact: true })).toHaveCount(0);

    const popupPromise = page.waitForEvent("popup");
    await row.getByRole("button", { name: "Open original post" }).click();
    const popup = await popupPromise;
    await popup.close();

    // markContacted stamps firstContactedAt and flips new -> contacted, then the
    // row refreshes via router.refresh() — this is the product's north-star
    // metric, so the UI reflecting it immediately is the behavior under test.
    await expect(row.getByText("contacted", { exact: true })).toBeVisible();
  });

  test("the triage view button narrows to buyer lead type, new status, priority sort", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/leads");

    await page.getByRole("button", { name: "Triage view" }).click();

    await expect(page).toHaveURL(/leadType=buyer/);
    await expect(page).toHaveURL(/status=new/);
    await expect(page).toHaveURL(/sort=priority/);
  });

  test("the dataset-scope dropdown opens and filters without crashing", async ({ page }) => {
    // Regression: Base UI's Menu.GroupLabel throws at open time (not build
    // time) when used outside a Menu.Group — this dropdown had exactly that
    // bug and nothing had ever opened it in a test, so it shipped broken.
    await loginAsAdmin(page);
    await page.goto("/leads");

    await page.getByRole("button", { name: /All datasets/ }).click();
    await expect(page.getByText("Dataset scope")).toBeVisible();

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const option = page.getByRole("menuitem").filter({ hasNotText: "All datasets" }).first();
    if (await option.count()) {
      await option.click();
      await expect(page).toHaveURL(/datasetId=/);
    }

    expect(errors).toEqual([]);
  });

  test("clicking a row opens the lazy-loaded lead detail sheet", async ({ page }) => {
    // LeadDetailSheet is a next/dynamic(..., { ssr: false }) import (see
    // lead-inbox.tsx) — this proves the chunk actually loads and renders,
    // not just that the static parts of the page do.
    await loginAsAdmin(page);
    await page.goto("/leads");

    const row = page.getByRole("row", { name: new RegExp(E2E_LEAD_AUTHOR) });
    await row.click();

    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
    // exact: true matters — the "closed" status button's label otherwise
    // substring-matches the sheet's own "Close" button.
    await expect(page.getByRole("button", { name: "closed", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Status" })).toBeHidden();
  });

  test("linking a new affiliated company from the detail sheet persists it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/leads");

    const row = page.getByRole("row", { name: new RegExp(E2E_LEAD_AUTHOR) });
    await row.click();
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();

    const companyName = `Smoke Test Villas ${Date.now()}`;
    await page.getByPlaceholder("Search or add a company…").fill(companyName);
    await page.getByRole("button", { name: "Link" }).click();
    // Scoped to the affiliated-companies list container, not just any text
    // match or ARIA role — the success toast's own "Linked to {companyName}"
    // wording also contains the company name (and Sonner's toast markup also
    // satisfies getByRole("listitem"), which is what made that scoping not
    // actually unambiguous), so both a bare `getByText` and a bare
    // `getByRole("listitem")` are flaky here depending on whether the toast
    // has faded by assertion time.
    await expect(page.getByTestId("affiliated-companies-list").getByText(companyName)).toBeVisible();
  });
});
