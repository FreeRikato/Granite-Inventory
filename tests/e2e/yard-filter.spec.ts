import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

declare global {
  interface Window {
    __longestInteraction: number;
    __pendingStates: string[];
  }
}

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("typing a ten character filter quickly keeps every character and filters the list", async ({
  page,
  signIn,
}, testInfo) => {
  await signIn("operator");
  await page.addInitScript(() => {
    window.__longestInteraction = 0;
    const options: PerformanceObserverInit & { durationThreshold: number } = {
      type: "event",
      durationThreshold: 16,
      buffered: true,
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longestInteraction = Math.max(window.__longestInteraction, entry.duration);
      }
    }).observe(options);
  });
  await page.goto("/yard");
  const search = page.getByRole("textbox", { name: "Search batches" });
  await expect(page.getByTestId("yard-batch").first()).toBeVisible();
  await expect
    .poll(() => search.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber$"))))
    .toBe(true);

  await page.evaluate(() => {
    window.__pendingStates = [];
    const toolbar = document.querySelector("[data-yard-filter-toolbar]");
    if (!toolbar) throw new Error("filter toolbar missing");
    new MutationObserver(() => window.__pendingStates.push(toolbar.getAttribute("data-pending") ?? "")).observe(
      toolbar,
      { attributes: true, attributeFilter: ["data-pending"] },
    );
  });

  const typed = "blackpearl";
  const list = page.getByTestId("yard-list");
  await search.pressSequentially(typed, { delay: 25 });
  await expect(list).toHaveCSS("opacity", "0.6");
  await expect(search).toHaveValue(typed);
  await expect(page).toHaveURL(new RegExp(`q=${typed}`));
  await expect(page.getByTestId("yard-batch")).toHaveCount(0);
  await expect(list).toHaveCSS("opacity", "1");
  const pendingStates = await page.evaluate(() => window.__pendingStates);
  expect(pendingStates).toContain("true");
  expect(pendingStates.at(-1)).toBe("false");

  await search.fill("BP-NEW");
  await expect(page.getByTestId("yard-batch")).toHaveCount(1);

  const longestInteraction = await page.evaluate(() => window.__longestInteraction);
  testInfo.annotations.push({ type: "longest-interaction-ms", description: String(longestInteraction) });
});

test("changing a toggle flags the filter as pending until the list has updated", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/yard");
  const toggle = page.getByRole("switch", { name: "Show sold out" });
  await expect(page.getByTestId("yard-batch").first()).toBeVisible();
  await expect
    .poll(() => toggle.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber$"))))
    .toBe(true);

  await page.evaluate(() => {
    window.__pendingStates = [];
    const toolbar = document.querySelector("[data-yard-filter-toolbar]");
    if (!toolbar) throw new Error("filter toolbar missing");
    new MutationObserver(() => window.__pendingStates.push(toolbar.getAttribute("data-pending") ?? "")).observe(
      toolbar,
      { attributes: true, attributeFilter: ["data-pending"] },
    );
  });

  await toggle.click();
  await expect(page).toHaveURL(/sold=1/);
  await expect(page.getByTestId("yard-list")).toHaveCSS("opacity", "1");
  const pendingStates = await page.evaluate(() => window.__pendingStates);
  expect(pendingStates).toContain("true");
  expect(pendingStates.at(-1)).toBe("false");
});
