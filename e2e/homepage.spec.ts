import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.describe("homepage", () => {
  test("a signed-out visitor sees the marketing homepage at /, not a login redirect", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Whoever replies first wins the deal" })).toBeVisible();
  });

  test("a signed-in visitor hitting / still lands on the lead inbox", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/leads$/);

    await page.goto("/");

    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();
  });
});
