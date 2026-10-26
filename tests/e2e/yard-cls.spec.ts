import type { Locator } from "@playwright/test";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

declare global {
  interface Window {
    __yardCumulativeLayoutShift: number;
  }
}

async function waitForHydration(trigger: Locator): Promise<void> {
  await expect
    .poll(() => trigger.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber$"))), {
      timeout: 20_000,
    })
    .toBe(true);
}

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("every yard filter select shows a value as soon as the row renders", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/yard");
  await expect(page.getByRole("combobox", { name: "Sort" })).toBeVisible();

  const selectValues = await page.locator('[data-slot="select-value"]').allInnerTexts();
  expect(selectValues).toHaveLength(6);
  expect(selectValues.map((value) => value.trim()).filter((value) => value === "")).toHaveLength(0);
});

test("yard filter toolbar stays within the CLS budget on a cold navigation", async ({ page, signIn }) => {
  await signIn("operator");
  await page.addInitScript(() => {
    window.__yardCumulativeLayoutShift = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ("value" in entry && typeof entry.value === "number") {
          window.__yardCumulativeLayoutShift += entry.value;
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/yard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();
  await waitForHydration(page.getByRole("combobox", { name: "Sort" }));
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const cumulativeLayoutShift = await page.evaluate(() => window.__yardCumulativeLayoutShift);
  expect(cumulativeLayoutShift).toBeLessThan(0.1);
});
