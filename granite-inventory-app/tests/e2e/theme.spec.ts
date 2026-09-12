import { expect, test, ensureTestUsers } from "./fixtures";
import type { Page } from "@playwright/test";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

const DARK = /\bdark\b/;

/* Clicks the toggle until the html class flips. A click that lands before hydration on a cold
   dev server is dropped, so a single click is not enough to assert on. */
async function flipTheme(page: Page, expectDark: boolean): Promise<void> {
  const toggle = page.getByRole("button", { name: "Toggle dark mode" }).locator("visible=true");
  await expect(toggle).toHaveCount(1);
  await expect(async () => {
    await toggle.click();
    const matcher = expect(page.locator("html"));
    await (expectDark ? matcher.toHaveClass(DARK, { timeout: 2_000 }) : matcher.not.toHaveClass(DARK, { timeout: 2_000 }));
  }).toPass({ timeout: 20_000 });
}

test("theme toggle flips dark mode and the choice survives a reload", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/");
  await flipTheme(page, true);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(DARK);
  await flipTheme(page, false);
});

test("login and public catalog expose the toggle without a session", async ({ page }) => {
  await sql(`update public.settings set catalog_public = true`);
  await page.goto("/login");
  await flipTheme(page, true);
  await page.goto("/catalog");
  await expect(page.locator("html")).toHaveClass(DARK);
  await expect(page.getByRole("button", { name: "Toggle dark mode" }).locator("visible=true")).toHaveCount(1);
});
