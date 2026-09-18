import type { Locator } from "@playwright/test";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

declare global {
  interface Window {
    __yardCumulativeLayoutShift: number;
  }
}

/* The shift this test guards happens when the filter row renders with its values (once from
   the browser cache, or, if a select ever regresses to an empty value that fills in later, twice),
   so the CLS counter must not be read before that. The heading is server rendered and does not
   tell us, and a click would taint the entries with hadRecentInput. React tags every DOM node it
   owns with a __reactFiber$ property, so poll the trigger for that instead. */
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
  /* The filter row arrives with the batches from the browser cache, all at once; a select
     whose value fills in a beat later is the shift the CLS test below guards against. */
  await expect(page.getByRole("combobox", { name: "Sort" })).toBeVisible();

  const selectValues = await page.locator('[data-slot="select-value"]').allInnerTexts();
  expect(selectValues).toHaveLength(6);
  expect(selectValues.map((value) => value.trim()).filter((value) => value === "")).toHaveLength(0);
});

test("yard filter toolbar stays within the CLS budget on a cold navigation", async ({ page, signIn }) => {
  await signIn("operator");
  await page.addInitScript(() => {
    window.__yardCumulativeLayoutShift = 0;
    /* No input is dispatched in this test, so every shift counts. Chromium flags the shifts
       under Playwright's mobile emulation as hadRecentInput, which would hide the very shift
       this test guards on the mobile project. */
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
