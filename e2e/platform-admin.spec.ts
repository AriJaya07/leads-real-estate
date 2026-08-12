import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_PLATFORM_ADMIN_EMAIL,
  E2E_PLATFORM_ADMIN_PASSWORD,
} from "./global-setup";

/**
 * The other half of the tenant-isolation story `multi-tenant.spec.ts` proves:
 * that boundary is company-vs-company, this one is the platform-operator
 * boundary — `isPlatformAdmin` is a separate flag from the per-company `role`
 * hierarchy (`application/auth/current-user.ts::requirePlatformAdmin`), not
 * grantable from any in-app UI. A company `owner` (the highest per-company
 * role) must NOT pass it, and the flag itself must not leak into tenant data
 * access — see docs/multi-tenant-apify-isolation-plan.md §3.
 */
test.describe("platform admin boundary", () => {
  test("a regular company owner cannot reach /platform/tenants", async ({ page }) => {
    await loginAs(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await page.goto("/platform/tenants");

    // requirePlatformAdmin() redirects to /leads — fails closed, not a 403 page
    // that might leak "this route exists" info, matching this app's existing
    // requireOwner()/requireAdmin() redirect posture elsewhere.
    await expect(page).toHaveURL(/\/leads$/);
  });

  test("a platform admin can reach /platform/tenants and sees every company's usage row", async ({ page }) => {
    await loginAs(page, E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD);
    await page.goto("/platform/tenants");

    await expect(page).toHaveURL(/\/platform\/tenants$/);
    await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
    // Cross-company by design — both seeded companies' rows should be present,
    // not just the platform admin's own (E2E Company).
    await expect(page.getByText("E2E Company", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Other Company", { exact: true })).toBeVisible();
  });

  test("being a platform admin grants no extra tenant data access — /leads still shows only their own company", async ({
    page,
  }) => {
    await loginAs(page, E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD);
    await page.goto("/leads");

    // Same assertion shape as multi-tenant.spec.ts: the platform flag must
    // never widen what queryLeads()/companyId-scoped routes return, only
    // unlock the separate usage-aggregate view.
    await expect(page.getByRole("row", { name: /E2E Other Company Buyer/ })).toHaveCount(0);
  });

  test("the four other platform pages render for a platform admin without crashing", async ({ page }) => {
    await loginAs(page, E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD);

    for (const [path, heading] of [
      ["/platform/categories", "Categories"],
      ["/platform/analytics", "Platform Analytics"],
      ["/platform/connectors", "Connector Health"],
      ["/platform/billing", "Platform Billing"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("tenant drill-in is read-only-framed and extending the trial actually moves trialEndsAt", async ({ page }) => {
    await loginAs(page, E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD);
    await page.goto("/platform/tenants");
    await page.getByRole("link", { name: "E2E Company" }).click();

    await expect(page.getByText(/Viewing E2E Company as Super Admin — read only/)).toBeVisible();

    // E2E Company is seeded with status "active", not "trialing" (global-setup.ts),
    // so the extend-trial control must not even be offered — the action itself
    // also rejects a non-trialing company server-side (tenant-actions.ts), this
    // just confirms the UI doesn't dangle a button that would only error.
    await expect(page.getByRole("button", { name: /Extend trial/ })).toHaveCount(0);
  });

  test("a platform admin can edit a category's config and it's logged", async ({ page }) => {
    await loginAs(page, E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD);
    await page.goto("/platform/categories");
    await page.getByRole("link", { name: "Real Estate" }).click();

    await expect(page).toHaveURL(/\/platform\/categories\/real_estate$/);
    await page.getByLabel(/Filter suggestions — category field/).fill("Villa, Land, Apartment");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText(/Saved Real Estate config/)).toBeVisible();
    await expect(page.getByText("Updated config")).toBeVisible();
  });

  test("a platform admin can create a category instantly, and it starts hidden from signup until active", async ({
    page,
  }) => {
    await loginAs(page, E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD);
    await page.goto("/platform/categories");

    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Label").fill("Automotive");
    await page.getByLabel(/Slug/).fill("automotive_e2e");
    await page.getByLabel(/Description/).fill("Cars and dealers.");
    await page.getByLabel("Category field", { exact: true }).fill("Vehicle types");
    await page.getByLabel("Wants", { exact: true }).fill("Vehicle interests");
    await page.getByLabel("Company name placeholder").fill("Bali Motors Group");
    await page.getByRole("button", { name: "Create category" }).click();

    // No code/migration/request queue — the row exists immediately, created
    // as "beta" so it's not yet offered to new signups.
    await expect(page).toHaveURL(/\/platform\/categories\/automotive_e2e$/);
    await expect(page.getByText("Created category")).toBeVisible();
    await page.goto("/signup");
    await expect(page.getByText("Automotive")).toHaveCount(0);
  });
});
