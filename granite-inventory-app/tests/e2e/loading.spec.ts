import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";
import type { Page } from "@playwright/test";
import { setTimeout } from "node:timers/promises";

test.describe("instant loading titles", () => {
  test.beforeAll(async () => {
    await ensureTestUsers();
  });

  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
    await sql(`insert into public.customers (name, customer_type) values ('Relay Detail Customer', 'REGULAR')`);
  });

  async function delayRscResponses(page: Page, requestDelayMs = 0): Promise<void> {
    await page.route(
      (url) => url.searchParams.has("_rsc"),
      async (route) => {
        if (requestDelayMs > 0) await setTimeout(requestDelayMs);
        await route.continue();
        await setTimeout(1_500);
      },
    );
  }

  test("shows the destination title while Yard Slots is loading", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Loading timing is covered on desktop only");
    await signIn("admin");
    await delayRscResponses(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const loading = page.locator('main [aria-busy="true"]');
    const navigation = page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(loading).toContainText("Yard Slots", { timeout: 500 });
    await expect(page.getByRole("heading", { name: "Yard Slots" })).not.toBeVisible({ timeout: 100 });

    await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible({ timeout: 5_000 });
    await expect(loading).toHaveCount(0);
    await navigation;
  });

  test("does not show the Customers title while a customer detail loads", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Loading timing is covered on desktop only");
    await signIn("admin");
    await delayRscResponses(page);
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await page.getByLabel("Search customers").fill("Relay");

    const loading = page.locator('main [aria-busy="true"]');
    const customer = page.getByTestId("customer-row").filter({ hasText: "Relay Detail Customer" });
    const navigation = customer.click();
    await expect
      .poll(async () => {
        const text = await loading.textContent();
        const detailVisible = await page.getByRole("heading", { name: "Relay Detail Customer" }).isVisible();
        return detailVisible || text === null || !text.includes("Customers");
      }, { timeout: 15_000 })
      .toBe(true);

    await expect(page.getByRole("heading", { name: "Relay Detail Customer" })).toBeVisible({ timeout: 15_000 });
    await expect(loading).toHaveCount(0);
    await navigation;
  });
});
