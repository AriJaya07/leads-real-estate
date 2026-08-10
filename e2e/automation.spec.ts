import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("automation settings", () => {
  test("enabling auto-assignment and reminders persists across a reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/automation");
    await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible();

    // Base UI's Switch syncs a visually-hidden native checkbox for form
    // semantics — `.getByLabel(...).check()` targets that hidden input
    // directly, which never satisfies Playwright's viewport-actionability
    // check. Clicking the accessible switch role is the same action a real
    // user takes.
    await page.getByRole("switch", { name: "Automatic lead assignment" }).click();
    await page.getByRole("switch", { name: "Stale lead reminders" }).click();
    await page.getByLabel("Remind after (days inactive)").fill("5");
    await page.getByLabel("Recipients (comma-separated)").first().fill("manager@example.com");

    await page.getByRole("button", { name: "Save automation settings" }).click();
    await expect(page.getByText("Automation settings saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Automatic lead assignment")).toBeChecked();
    await expect(page.getByLabel("Stale lead reminders")).toBeChecked();
    await expect(page.getByLabel("Remind after (days inactive)")).toHaveValue("5");
    await expect(page.getByLabel("Recipients (comma-separated)").first()).toHaveValue("manager@example.com");
  });

  test("generating a webhook secret shows it immediately and it survives saving the form", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/automation");

    await page.getByRole("switch", { name: "Outbound webhook" }).click();
    await page.getByLabel("Endpoint URL").fill("https://hooks.example.com/averonai");
    await page.getByRole("button", { name: "Generate" }).click();

    const secret = page.getByTestId("webhook-secret");
    await expect(secret).not.toHaveText("Not generated yet");
    const generated = await secret.textContent();
    expect(generated).toMatch(/^[0-9a-f]{48}$/);

    await page.getByRole("button", { name: "Save automation settings" }).click();
    await expect(page.getByText("Automation settings saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Outbound webhook")).toBeChecked();
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("https://hooks.example.com/averonai");
    await expect(page.getByTestId("webhook-secret")).toHaveText(generated ?? "");
  });
});
