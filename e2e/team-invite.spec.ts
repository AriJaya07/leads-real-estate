import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("team invites", () => {
  test("owner invites a member by email, and the recipient accepts and signs in", async ({
    page,
    browser,
  }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/admin/team");

    const email = `invitee-${Date.now()}@example.com`;
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("manager");
    await page.getByRole("button", { name: "Send invite" }).click();

    // No RESEND_API_KEY in .env.e2e — the link is shown on screen instead of emailed.
    const linkCode = page.locator("code");
    await expect(linkCode).toBeVisible();
    const inviteUrl = await linkCode.textContent();
    expect(inviteUrl).toContain("/invite/");

    await page.reload();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    // A separate browser context, not just a new tab — the invitee is a
    // different user and must not share the owner's session cookie.
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(inviteUrl!);
    await expect(inviteePage.getByRole("heading", { name: /invited you to/ })).toBeVisible();

    await inviteePage.getByLabel("Your name").fill("New Manager");
    await inviteePage.getByLabel("Password").fill("a-brand-new-password-123");
    await inviteePage.getByRole("button", { name: "Join the team" }).click();

    await expect(inviteePage).toHaveURL(/\/leads$/);
    // Manager, not admin — sees Datasets/Sync but not Team.
    await expect(inviteePage.getByRole("link", { name: "Datasets" })).toBeVisible();
    await expect(inviteePage.getByRole("link", { name: "Team" })).toHaveCount(0);

    // The invite is now gone from the pending list on the owner's side —
    // the email still appears once, as a real roster member, so check the
    // pending-invite-specific action rather than the email text itself.
    // Member rows are plain divs, not a real <table> — ".divide-y > div" is
    // the roster's own direct-child structure (team-table.tsx), not a role.
    await page.reload();
    await expect(page.getByRole("button", { name: `Cancel invite for ${email}` })).toHaveCount(0);
    await expect(page.locator(".divide-y > div").filter({ hasText: email })).toBeVisible();
  });

  test("owner can revoke a pending invite before it's accepted", async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/admin/team");

    const email = `revoke-me-${Date.now()}@example.com`;
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();
    // Wait for the create to actually finish (link notice appears) before reloading.
    await expect(page.locator("code")).toBeVisible();
    await page.reload();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Cancel invite for ${email}` }).click();
    await expect(page.getByText(`Canceled invite for ${email}`)).toBeVisible();
    await page.reload();
    await expect(page.getByText(email, { exact: true })).toHaveCount(0);
  });
});

test.describe("role management", () => {
  test("owner promotes a member to manager, unlocking the admin datasets/sync nav for them", async ({
    page,
    browser,
  }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/leads$/);
    await page.goto("/admin/team");

    const email = `promote-${Date.now()}@example.com`;
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();
    const inviteUrl = await page.locator("code").textContent();

    // A separate browser context — the member is a different user and must
    // not share the owner's session cookie.
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(inviteUrl!);
    await memberPage.getByLabel("Password").fill("a-brand-new-password-123");
    await memberPage.getByRole("button", { name: "Join the team" }).click();
    await expect(memberPage).toHaveURL(/\/leads$/);
    await expect(memberPage.getByRole("link", { name: "Datasets" })).toHaveCount(0);

    await page.reload();
    const row = page.locator(".divide-y > div").filter({ hasText: email });
    await row.getByRole("combobox").selectOption("manager");
    await expect(row.getByRole("combobox")).toHaveValue("manager");

    await memberPage.reload();
    await expect(memberPage.getByRole("link", { name: "Datasets" })).toBeVisible();
  });
});
