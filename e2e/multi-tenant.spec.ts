import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers";
import { E2E_LEAD_AUTHOR, E2E_OTHER_COMPANY_LEAD_AUTHOR } from "./global-setup";

/**
 * This is the spec that actually proves the multi-tenant retrofit works, not
 * just that it compiles — see docs/saas-platform-architecture.md. Company A
 * (the seeded admin every other spec in this suite logs in as) must never see
 * company B's data: not in the list, not in search, and not by guessing the
 * other lead's id directly against the API.
 */

async function otherCompanyLeadId(): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [row] = await sql`SELECT id FROM leads WHERE name = ${E2E_OTHER_COMPANY_LEAD_AUTHOR} LIMIT 1`;
    return row.id as string;
  } finally {
    await sql.end();
  }
}

test.describe("multi-tenant isolation", () => {
  test("company A's inbox never lists company B's lead", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/leads");

    await expect(page.getByRole("row", { name: new RegExp(E2E_LEAD_AUTHOR) })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(E2E_OTHER_COMPANY_LEAD_AUTHOR) })).toHaveCount(0);
  });

  test("searching for company B's lead by name returns nothing", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/leads?q=${encodeURIComponent(E2E_OTHER_COMPANY_LEAD_AUTHOR)}`);

    await expect(page.getByRole("row", { name: new RegExp(E2E_OTHER_COMPANY_LEAD_AUTHOR) })).toHaveCount(0);
  });

  test("the appearances API refuses company B's lead id even while signed in as company A's admin", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const leadId = await otherCompanyLeadId();

    // Same authenticated browser context (shares the session cookie) as every
    // other request the UI itself makes — this proves the API route's own
    // companyId scope, not just that the UI happens not to render a link to it.
    const response = await page.request.get(`/api/leads/${leadId}/appearances`);
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { appearances: unknown[] };
    expect(body.appearances).toEqual([]);
  });
});
