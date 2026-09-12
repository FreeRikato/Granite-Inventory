import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

declare global {
  interface Window {
    __yardCumulativeLayoutShift: number;
  }
}

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("yard renders a value for every filter select on the server", async ({ page, signIn }) => {
  await signIn("operator");

  const response = await page.request.get("/yard");
  expect(response.ok()).toBe(true);

  const html = await response.text();
  const selectValues = [...html.matchAll(/<span[^>]*data-slot="select-value"[^>]*>([\s\S]*?)<\/span>/g)].map((match) =>
    match[1].replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").trim(),
  );

  expect(selectValues).toHaveLength(6);
  expect(selectValues.filter((value) => value === "")).toHaveLength(0);
});

test("yard filter toolbar stays within the CLS budget on a cold navigation", async ({ page, signIn }) => {
  await signIn("operator");
  await page.addInitScript(() => {
    window.__yardCumulativeLayoutShift = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          "value" in entry &&
          typeof entry.value === "number" &&
          "hadRecentInput" in entry &&
          entry.hadRecentInput === false
        ) {
          window.__yardCumulativeLayoutShift += entry.value;
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/yard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const cumulativeLayoutShift = await page.evaluate(() => window.__yardCumulativeLayoutShift);
  expect(cumulativeLayoutShift).toBeLessThan(0.1);
});
