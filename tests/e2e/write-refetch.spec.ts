import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import type { Page } from "@playwright/test";

function countRequests(page: Page): { readonly tables: () => string[]; readonly serverRefreshes: () => number } {
  const tables = new Set<string>();
  let serverRefreshes = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/rest/v1/") && request.method() === "GET") {
      tables.add(url.pathname.replace("/rest/v1/", "").replace("rpc/", ""));
    }
    const headers = request.headers();
    if (headers["rsc"] === "1" && !headers["next-router-prefetch"]) serverRefreshes += 1;
  });
  return { tables: () => [...tables].sort(), serverRefreshes: () => serverRefreshes };
}

test.describe("targeted refetch after a write", () => {
  test.beforeAll(async () => {
    await ensureTestUsers();
  });

  test.skip(({ isMobile }) => isMobile, "Request counts do not depend on the viewport");

  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
  });

  test("archiving a batch on Yard refetches only the yard batches and asks the server for nothing", async ({
    page,
    signIn,
  }) => {
    await signIn("admin");
    await page.goto("/yard?slot=4FT");
    const card = page.getByTestId("yard-batch").filter({ hasText: "BP-NEW-01" });
    await expect(card).toBeVisible();
    await expect(page.getByText("Updated just now").first()).toBeVisible();
    const net = countRequests(page);

    await card.getByRole("button", { name: "Archive BP-NEW-01", exact: true }).click();
    await expect(page.getByText("Batch BP-NEW-01 archived")).toBeVisible();
    await expect(card).toHaveCount(0);

    expect(net.tables()).toEqual(["v_yard_batches"]);
    expect(net.serverRefreshes()).toBe(0);
  });

  test("closing the edit dialog without saving refetches nothing", async ({ page, signIn }) => {
    await signIn("admin");
    await page.goto("/yard?slot=4FT");
    const card = page.getByTestId("yard-batch").filter({ hasText: "BP-NEW-01" });
    await expect(card).toBeVisible();
    await expect(page.getByText("Updated just now").first()).toBeVisible();
    const net = countRequests(page);

    await card.getByRole("button", { name: "Edit BP-NEW-01", exact: true }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(500);

    expect(net.tables()).toEqual([]);
    expect(net.serverRefreshes()).toBe(0);
  });

  const ROUND_TRIPS = [
    ["Yard", "Yard Slots", /\/yard/],
    ["Sell", "Sell Stone", /\/sell/],
  ] as const;

  const CREATED = [
    { kind: "product", field: "Product", name: "Green Marble", search: "Search products...", add: "Add product" },
    { kind: "supplier", field: "Supplier", name: "Salem Quarry", search: "Search suppliers...", add: "Add supplier" },
  ] as const;

  for (const created of CREATED) {
    for (const [route, link, url] of ROUND_TRIPS) {
      test(`a ${created.kind} created on Inward is in the picker after a trip to ${route}`, async ({
        page,
        signIn,
      }) => {
        await signIn("admin");
        await page.goto("/inward");
        await expect(page.getByRole("heading", { name: "Log New Purchase" })).toBeVisible();
        await page.getByRole("combobox", { name: created.field }).click();
        await page.getByPlaceholder(created.search).fill(created.name);
        await page.getByRole("option", { name: new RegExp(`Add ${created.kind} "${created.name}"`) }).click();
        const refetched = page.waitForResponse(
          (response) => response.request().method() === "GET" && response.url().includes(`/rest/v1/${created.kind}s?`),
          { timeout: 3_000 },
        );
        await page.getByRole("button", { name: created.add, exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
        await refetched;

        await page.getByRole("link", { name: link, exact: true }).first().click();
        await expect(page).toHaveURL(url);
        await page.getByRole("link", { name: "Inward Stock", exact: true }).first().click();
        await expect(page.getByRole("heading", { name: "Log New Purchase" })).toBeVisible();
        await page.getByRole("combobox", { name: created.field }).click();
        await page.getByPlaceholder(created.search).fill(created.name);
        await expect(page.getByRole("option", { name: new RegExp(`^${created.name}`) })).toBeVisible();
      });
    }
  }
});
