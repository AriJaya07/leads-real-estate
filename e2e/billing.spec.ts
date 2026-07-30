import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_THROTTLE_EMAIL, E2E_THROTTLE_PASSWORD } from "./global-setup";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("billing", () => {
  test("owner sees current plan and usage on /admin/billing", async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);

    await page.goto("/admin/billing");
    await expect(page.getByText("Current plan: E2E Company Plan")).toBeVisible();
    await expect(page.getByText("Seats", { exact: true })).toBeVisible();
    await expect(page.getByText("Storage", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Current plan: E2E Company Plan" })).toBeDisabled();
  });

  test("a downgrade that would exceed the target plan's seat limit is blocked with a clear error", async ({
    page,
  }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/admin/billing");

    await page.getByRole("button", { name: "Switch to E2E Tiny Plan" }).click();

    await expect(page.getByText(/reduce usage first/i)).toBeVisible();
    // Still on the original plan — the switch must not have gone through.
    await expect(page.getByText("Current plan: E2E Company Plan")).toBeVisible();
  });

  test("owner switches to a compatible plan and the change takes effect immediately", async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/admin/billing");

    await page.getByRole("button", { name: "Switch to E2E Roomy Plan" }).click();
    await expect(page.getByText(/Switched to the E2E Roomy Plan plan/i)).toBeVisible();

    await page.reload();
    await expect(page.getByText("Current plan: E2E Roomy Plan")).toBeVisible();
  });

  test("a non-owner (admin/manager/member) cannot reach /admin/billing", async ({ page }) => {
    // E2E_THROTTLE_EMAIL is seeded as "member" — requireOwner() must redirect it away.
    await login(page, E2E_THROTTLE_EMAIL, E2E_THROTTLE_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);

    await page.goto("/admin/billing");
    await expect(page).toHaveURL(/\/leads$/);
  });
});
