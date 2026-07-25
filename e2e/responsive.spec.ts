import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";
import { E2E_LEAD_AUTHOR } from "./global-setup";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("mobile navigation", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the sidebar is hidden and the drawer replaces it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/leads");

    await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeHidden();

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();

    await page.getByRole("link", { name: "Datasets" }).click();
    await expect(page).toHaveURL(/\/admin\/datasets/);
  });
});

test.describe("responsive lead layout", () => {
  test("below md, the lead inbox renders cards instead of a table, regardless of view param", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/leads");

    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.getByTestId("lead-list-mobile").getByText(E2E_LEAD_AUTHOR)).toBeVisible();
  });

  test("at md and up, the view toggle switches between table and cards", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/leads"); // default desktop viewport from playwright.config.ts

    await expect(page.getByRole("table")).toBeVisible();

    await page.getByRole("button", { name: "Card view" }).click();
    await expect(page).toHaveURL(/view=cards/);
    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.getByTestId("lead-list-desktop").getByText(E2E_LEAD_AUTHOR)).toBeVisible();

    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page).toHaveURL(/^(?!.*view=cards).*$/);
    await expect(page.getByRole("table")).toBeVisible();
  });
});
