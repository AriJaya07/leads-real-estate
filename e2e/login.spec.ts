import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_THROTTLE_EMAIL, E2E_THROTTLE_PASSWORD } from "./global-setup";

test.describe("login", () => {
  test("signs in with the seeded admin and lands on the lead inbox", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();
  });

  test("shows the invalid-credentials message for a wrong password without leaking which part was wrong", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Next's route announcer also carries role="alert", so scope to the form's
    // own error message rather than getByRole("alert") alone. Match on the
    // stable prefix only — the trailing "N attempts left" varies with the
    // account's recent-failure history.
    await expect(page.getByText("That email and password don't match.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("redirects a signed-out visitor away from an authenticated route", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login/);
  });

  test("throttles repeated failed attempts against the same account", async ({ page }) => {
    // Its own dedicated account (not E2E_ADMIN_EMAIL) so the earlier
    // wrong-password test in this file can't leave a stray failed attempt on
    // the counter this test is asserting an exact count against.
    await page.goto("/login");

    // LOGIN_MAX_FAILED_ATTEMPTS is 5 — the 6th attempt must be rejected outright,
    // without even reaching the password check.
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.getByLabel("Email").fill(E2E_THROTTLE_EMAIL);
      await page.getByLabel("Password", { exact: true }).fill("wrong-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("That email and password don't match.")).toBeVisible();
    }

    await page.getByLabel("Email").fill(E2E_THROTTLE_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(E2E_THROTTLE_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Too many failed attempts. Try again in a few minutes.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
