import { test, expect } from "@playwright/test";

/**
 * Replaces the old single-instance "first sign-in claims admin" bootstrap
 * (removed — see docs/saas-platform-architecture.md). A brand-new company is
 * created via /signup, not by being first through the door on a fresh
 * instance; every seeded account in global-setup.ts already belongs to a
 * company, so this is the only spec that exercises company creation itself.
 */
test.describe("signup", () => {
  test("creating a company signs you in as its first admin, landing on an empty lead inbox", async ({
    page,
  }) => {
    const uniqueSuffix = Date.now();
    await page.goto("/signup");

    await page.getByLabel("Company name").fill(`Signup Test Co ${uniqueSuffix}`);
    await page.getByLabel("Your email").fill(`signup-test-${uniqueSuffix}@example.com`);
    await page.getByLabel("Password").fill("signup-test-password-123");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();
    // A brand-new company has no data yet — the empty state, not another
    // company's seeded lead, is what should render.
    await expect(page.getByText(/no leads/i)).toBeVisible();
  });

  test("signing up twice with the same email is rejected", async ({ page }) => {
    const uniqueSuffix = Date.now();
    const email = `signup-dupe-${uniqueSuffix}@example.com`;

    await page.goto("/signup");
    await page.getByLabel("Company name").fill(`Dupe Test Co ${uniqueSuffix}`);
    await page.getByLabel("Your email").fill(email);
    await page.getByLabel("Password").fill("signup-test-password-123");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page).toHaveURL(/\/leads$/);

    await page.context().clearCookies();
    await page.goto("/signup");
    await page.getByLabel("Company name").fill(`Dupe Test Co Two ${uniqueSuffix}`);
    await page.getByLabel("Your email").fill(email);
    await page.getByLabel("Password").fill("another-password-456");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page.getByText("That email already has an account.")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
