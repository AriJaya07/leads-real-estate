import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";
import { E2E_LEAD_AUTHOR } from "./global-setup";

/** Column container from its heading — two levels up: heading -> header row -> column. */
function columnByStatus(page: import("@playwright/test").Page, status: RegExp) {
  return page.getByRole("heading", { name: status }).locator("xpath=../..");
}

test.describe("pipeline board", () => {
  test("moving the seeded lead via the status dropdown updates the board", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/pipeline");

    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    // Not assumed to start in "New" — another spec (lead-triage.spec.ts) may
    // already have contacted this same seeded lead earlier in a full suite run.
    await expect(page.getByText(E2E_LEAD_AUTHOR)).toBeVisible();

    await page.getByLabel(`Status for ${E2E_LEAD_AUTHOR}`).selectOption("negotiation");

    // Reappears in Negotiation once the shared "leads" query cache
    // invalidates and every column refetches.
    const negotiationColumn = columnByStatus(page, /^negotiation$/i);
    await expect(negotiationColumn.getByText(E2E_LEAD_AUTHOR)).toBeVisible();
  });

  test("dragging a card to another column changes its status", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/pipeline");

    // Native HTML5 drag-and-drop doesn't fire from simulated mouse movement in
    // Chromium under automation — dispatch the drag/drop events directly with
    // a real DataTransfer, which is what actually exercises the component's
    // onDragStart/onDrop handlers (Playwright's documented workaround).
    const card = page.getByText(E2E_LEAD_AUTHOR).first();
    await expect(card).toBeVisible();
    const qualifiedColumn = columnByStatus(page, /^qualified$/i);

    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent("dragstart", { dataTransfer });
    await qualifiedColumn.dispatchEvent("dragover", { dataTransfer });
    await qualifiedColumn.dispatchEvent("drop", { dataTransfer });

    await expect(qualifiedColumn.getByText(E2E_LEAD_AUTHOR)).toBeVisible();
  });
});
