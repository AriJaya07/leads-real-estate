import { test, expect } from "@playwright/test";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_REVOCATION_EMAIL,
  E2E_REVOCATION_NEW_PASSWORD,
  E2E_REVOCATION_PASSWORD,
  E2E_TEMP_PASSWORD_EMAIL,
  E2E_TEMP_PASSWORD_NEW,
  E2E_TEMP_PASSWORD_TEMP,
} from "./global-setup";

const SESSION_COOKIE_NAME = "dreamrue_session";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("forced password change", () => {
  test("a temporary-password account is redirected to /account instead of the inbox", async ({
    page,
  }) => {
    await login(page, E2E_TEMP_PASSWORD_EMAIL, E2E_TEMP_PASSWORD_TEMP);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(/temporary password/i)).toBeVisible();
  });

  test("cannot reach a protected page by navigating directly while the flag is still set", async ({
    page,
  }) => {
    await login(page, E2E_TEMP_PASSWORD_EMAIL, E2E_TEMP_PASSWORD_TEMP);
    await expect(page).toHaveURL(/\/account$/);

    // Server-side enforcement (requireUser()), not just "the login form didn't
    // link there" — a direct navigation must still bounce back.
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("changing the password clears the flag and unlocks the rest of the app", async ({ page }) => {
    await login(page, E2E_TEMP_PASSWORD_EMAIL, E2E_TEMP_PASSWORD_TEMP);
    await expect(page).toHaveURL(/\/account$/);

    await page.getByLabel("Current password").fill(E2E_TEMP_PASSWORD_TEMP);
    await page.getByLabel("New password").fill(E2E_TEMP_PASSWORD_NEW);
    await page.getByRole("button", { name: "Change password" }).click();

    // The action re-issues the session for this device, so no re-login needed.
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();

    await page.goto("/admin/team");
    await expect(page).toHaveURL(/\/leads$/); // member, not admin — a *different* redirect proves they're past the account gate
  });
});

test.describe("profile", () => {
  test("saving the profile form persists across a reload", async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/account");

    await page.getByLabel("Job title").fill("Head of Sales");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Job title")).toHaveValue("Head of Sales");
  });
});

test.describe("teams panel", () => {
  test("creating a team and adding a member renders both", async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/admin/team");

    const teamName = `Smoke Test Team ${Date.now()}`;
    await page.getByLabel("New team").fill(teamName);
    await page.getByRole("button", { name: "Create team" }).click();
    await expect(page.getByText(teamName)).toBeVisible();

    // "Add member" is ambiguous page-wide — the roster form above has its own
    // submit button with the same accessible name. Scope to this team's card.
    const teamCard = page.locator(`[data-team-name="${teamName}"]`);
    await teamCard.getByRole("button", { name: "Add member" }).click();
    await teamCard.getByRole("combobox").selectOption({ label: "E2E Throttle Target" });
    await expect(teamCard.getByText("E2E Throttle Target")).toBeVisible();
  });
});

test.describe("sign out", () => {
  test("the topbar account menu signs out and returns to /login", async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);

    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("session revocation", () => {
  test("changing your password signs out every other session for the account", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, E2E_REVOCATION_EMAIL, E2E_REVOCATION_PASSWORD);
    await expect(pageA).toHaveURL(/\/leads$/);

    // Simulate a second device: a fresh browser context carrying the exact
    // same session cookie contextA just received.
    const sessionCookie = (await contextA.cookies()).find((c) => c.name === SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();

    const contextB = await browser.newContext();
    await contextB.addCookies([sessionCookie!]);
    const pageB = await contextB.newPage();
    await pageB.goto("/leads");
    await expect(pageB).toHaveURL(/\/leads$/); // proves the cloned cookie is valid before revocation

    // Change the password on device A only.
    await pageA.goto("/account");
    await pageA.getByRole("tab", { name: "Security" }).click();
    await pageA.getByLabel("Current password").fill(E2E_REVOCATION_PASSWORD);
    await pageA.getByLabel("New password").fill(E2E_REVOCATION_NEW_PASSWORD);
    await pageA.getByRole("button", { name: "Change password" }).click();
    await expect(pageA).toHaveURL(/\/leads$/); // device A stays signed in — it proved the current password

    // Device B's now-stale cookie must be rejected on its very next request.
    await pageB.goto("/leads");
    await expect(pageB).toHaveURL(/\/login/);

    await contextA.close();
    await contextB.close();
  });
});
