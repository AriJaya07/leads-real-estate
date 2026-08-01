import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const email = `me.jayakusuma+check${Date.now()}@gmail.com`;
const password = "correct-horse-battery-staple";

page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("response", (r) => { if (r.request().method() === "POST") console.log("[POST]", r.url(), r.status()); });

await page.goto("http://localhost:3000/signup");
await page.waitForSelector('input[name="companyName"]');
await page.fill('input[name="companyName"]', "Check Co");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
console.log("SIGNUP -> url:", page.url());
console.log("SIGNUP -> alerts:", await page.locator('[role="alert"]').allTextContents());

// Sign out then log back in with the same credentials.
await page.goto("http://localhost:3000/login");
await page.waitForSelector('input[name="email"]');
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
console.log("LOGIN -> url:", page.url());
console.log("LOGIN -> alerts:", await page.locator('[role="alert"]').allTextContents());

await browser.close();
