import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";
import type { Page } from "@playwright/test";

type LoadingRecord = {
  readonly placeholderText: string;
  readonly headingPresentAtThatMoment: boolean;
};

declare global {
  interface Window {
    __loadingRecord: LoadingRecord | null;
    __loadingObserver?: MutationObserver;
  }
}

test.describe("instant loading titles", () => {
  test.beforeAll(async () => {
    await ensureTestUsers();
  });

  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
    await sql(`insert into public.customers (name, customer_type) values ('Relay Detail Customer', 'REGULAR')`);
  });

  async function observeLoading(page: Page, destinationTitle: string): Promise<void> {
    await page.evaluate((title) => {
      window.__loadingObserver?.disconnect();
      window.__loadingRecord = null;

      const observer = new MutationObserver(() => {
        if (window.__loadingRecord) return;

        const loading = document.querySelector<HTMLElement>('main [aria-busy="true"]');
        if (!loading) return;

        window.__loadingRecord = {
          placeholderText: loading.textContent?.trim() ?? "",
          headingPresentAtThatMoment: Array.from(document.querySelectorAll("main h1")).some(
            (heading) => heading.textContent?.trim() === title,
          ),
        };
        observer.disconnect();
        window.__loadingObserver = undefined;
      });

      window.__loadingObserver = observer;
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }, destinationTitle);
  }

  async function readLoadingRecord(page: Page): Promise<LoadingRecord | null> {
    return page.evaluate(() => window.__loadingRecord);
  }

  test("shows the destination title while Yard Slots is loading", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Loading timing is covered on desktop only");
    await signIn("admin");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const loading = page.locator('main [aria-busy="true"]');
    await observeLoading(page, "Yard Slots");
    await page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();

    const record = await readLoadingRecord(page);
    expect(record).not.toBeNull();
    expect(record?.placeholderText).toBe("Yard Slots");
    expect(record?.headingPresentAtThatMoment).toBe(false);
    await expect(loading).toHaveCount(0);
  });

  test("does not show the Customers title while a customer detail loads", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Loading timing is covered on desktop only");
    await signIn("admin");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const loading = page.locator('main [aria-busy="true"]');
    await observeLoading(page, "Yard Slots");
    await page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();

    const yardRecord = await readLoadingRecord(page);
    expect(yardRecord).not.toBeNull();
    expect(yardRecord?.placeholderText).toBe("Yard Slots");
    expect(yardRecord?.headingPresentAtThatMoment).toBe(false);
    await expect(loading).toHaveCount(0);

    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await page.getByLabel("Search customers").fill("Relay");

    const customer = page.getByTestId("customer-row").filter({ hasText: "Relay Detail Customer" });
    await observeLoading(page, "Relay Detail Customer");
    await customer.click();
    await expect(page.getByRole("heading", { name: "Relay Detail Customer" })).toBeVisible();

    const record = await readLoadingRecord(page);
    expect(record).not.toBeNull();
    expect(record?.placeholderText).toBe("");
    await expect(loading).toHaveCount(0);
  });
});
