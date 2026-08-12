import type { Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
}

/** Generic login for specs that need an account other than the default seeded admin. */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/leads$/);
}
