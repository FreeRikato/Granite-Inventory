import type { Page } from "@playwright/test";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

declare global {
  interface Window {
    __routeShift: number;
    __skeletonsSeen: string[];
    __dataAgeHeights: number[];
    __dataAgeRows: number;
    __fadeDurations: number[];
  }
}

const CLS_BUDGET = 0.02;

type Route = {
  readonly name: string;
  readonly path: (customerId: string) => string;
  readonly ready: (page: Page) => ReturnType<Page["locator"]>;
  readonly fades: boolean;
};

const ROUTES: readonly Route[] = [
  { name: "overview", fades: true, path: () => "/", ready: (page) => page.getByTestId("kpi-active") },
  { name: "yard", fades: true, path: () => "/yard", ready: (page) => page.getByTestId("yard-stack").first() },
  {
    name: "sell",
    fades: true,
    path: () => "/sell",
    ready: (page) => page.getByRole("heading", { name: "This order" }),
  },
  {
    name: "inward",
    fades: true,
    path: () => "/inward",
    ready: (page) => page.getByRole("heading", { name: "Log New Purchase" }),
  },
  {
    name: "customers",
    fades: true,
    path: () => "/customers",
    ready: (page) => page.getByTestId("customer-row").first(),
  },
  {
    name: "customer",
    fades: true,
    path: (id) => `/customers/${id}`,
    ready: (page) => page.getByRole("heading", { name: "Skeleton Customer" }),
  },
];

async function watchRoute(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__routeShift = 0;
    window.__skeletonsSeen = [];
    window.__dataAgeHeights = [];
    window.__dataAgeRows = 0;
    window.__fadeDurations = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) window.__routeShift += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    const sample = () => {
      for (const node of document.querySelectorAll<HTMLElement>("main [data-skeleton]")) {
        const name = node.dataset.skeleton ?? "";
        if (!window.__skeletonsSeen.includes(name)) window.__skeletonsSeen.push(name);
      }
      for (const animation of document.getAnimations()) {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        if (!(animation instanceof CSSAnimation) || animation.animationName !== "enter") continue;
        if (!target?.closest("main") || target.closest("[data-skeleton]")) continue;
        const duration = Number(animation.effect?.getComputedTiming().duration);
        if (!window.__fadeDurations.includes(duration)) window.__fadeDurations.push(duration);
      }
      const row = document.querySelector<HTMLElement>('main [data-testid="data-age"]');
      if (row) {
        window.__dataAgeRows += 1;
        window.__dataAgeHeights.push(Math.round(row.getBoundingClientRect().height));
      }
      requestAnimationFrame(sample);
    };
    sample();
  });
}

test.describe("route skeletons", () => {
  let customerId = "";

  test.beforeAll(async () => {
    await ensureTestUsers();
  });

  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
    const rows = await sql<{ id: string }>(
      `insert into public.customers (name, customer_type) values ('Skeleton Customer', 'REGULAR') returning id`,
    );
    customerId = rows[0]?.id ?? "";
  });

  for (const route of ROUTES) {
    test(`${route.name} shows its own skeleton until data and stays within the CLS budget`, async ({
      page,
      signIn,
    }, testInfo) => {
      testInfo.skip(testInfo.project.name !== "desktop", "Layout shift is measured on desktop");
      await signIn("admin");
      await watchRoute(page);

      await page.goto(route.path(customerId), { waitUntil: "domcontentloaded" });
      await expect(route.ready(page)).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.waitForTimeout(500);

      expect(await page.evaluate(() => window.__skeletonsSeen)).toEqual([route.name]);
      if (route.fades) expect(await page.evaluate(() => window.__fadeDurations)).toEqual([200]);
      await expect(page.locator("main [data-skeleton]")).toHaveCount(0);
      expect(await page.evaluate(() => window.__routeShift)).toBeLessThanOrEqual(CLS_BUDGET);
    });
  }

  test("the data age row keeps one height from skeleton to content to refetch", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Layout shift is measured on desktop");
    await signIn("admin");
    await watchRoute(page);

    await page.goto("/customers", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("customer-row").first()).toBeVisible();
    await page.waitForTimeout(1_500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("customer-row").first()).toBeVisible();
    await page.waitForTimeout(500);

    const heights = await page.evaluate(() => [...new Set(window.__dataAgeHeights)]);
    expect(heights).toHaveLength(1);
    expect(heights[0]).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__routeShift)).toBeLessThanOrEqual(CLS_BUDGET);
  });

  test("the data age row never warns about an uncached getSnapshot", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Console output is the same on both projects");
    await signIn("admin");
    await page.addInitScript(() => {
      let clock = Date.now();
      Date.now = () => ++clock;
    });
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("getSnapshot")) warnings.push(message.text());
    });

    await page.goto("/customers", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("customer-row").first()).toBeVisible();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("kpi-active")).toBeVisible();

    expect(warnings).toEqual([]);
  });
});
