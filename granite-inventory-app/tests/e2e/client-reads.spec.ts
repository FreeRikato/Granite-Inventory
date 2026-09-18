import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";
import type { Page } from "@playwright/test";

/* Yard and Sell are static shells whose rows come straight from Supabase into the browser
   cache. Under `next dev` a navigation still fetches the shell from the server (dev never
   prefetches), so the check is: the batches arrive through the Supabase REST API and the
   server's render payload carries none of them. Production prefetches the static shell, which
   makes the click free of server round trips; that is measured on staging, not here. */
function watch(page: Page): { readonly restReads: () => number; readonly serverPayloads: () => Promise<string> } {
  let restReads = 0;
  const payloads: Promise<string>[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/") && request.method() === "GET") restReads += 1;
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.headers()["rsc"] === "1") payloads.push(response.text().catch(() => ""));
  });
  return {
    restReads: () => restReads,
    serverPayloads: async () => (await Promise.all(payloads)).join("\n"),
  };
}

test.describe("client reads", () => {
  test.beforeAll(async () => {
    await ensureTestUsers();
  });

  test.beforeEach(async () => {
    await resetDomainData();
    await seedYard();
    await sql(`insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`);
  });

  test("Yard and Sell read their rows from Supabase, not from the server render", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Navigation caching is covered on desktop only");
    await signIn("admin");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    const net = watch(page);

    await page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(page.getByTestId("yard-batch")).toHaveCount(2);
    expect(net.restReads()).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Sell Stone" }).click();
    await expect(page.getByRole("heading", { name: "Sell Stone" })).toBeVisible();
    await page.getByRole("combobox", { name: "Product / Variant" }).click();
    await expect(page.getByRole("option", { name: /Black Pearl/ }).first()).toBeVisible();

    expect(await net.serverPayloads()).not.toContain("BP-OLD-01");
  });

  test("a sale shows in the yard on the very next click, inside the stale window", async ({ page, signIn }, testInfo) => {
    testInfo.skip(testInfo.project.name !== "desktop", "Navigation caching is covered on desktop only");
    await signIn("operator");
    await page.goto("/yard?slot=4FT");
    const old = page.locator('[data-batch-code="BP-OLD-01"]');
    await expect(old).toContainText("Available:7");

    await page.getByRole("link", { name: "Sell Stone" }).click();
    await expect(page.getByRole("heading", { name: "Sell Stone" })).toBeVisible();
    await page.getByRole("combobox", { name: "Customer" }).click();
    await page.getByPlaceholder("Name or phone...").fill("98765");
    await page.getByRole("option", { name: /Murugan Constructions/ }).click();
    await page.getByRole("combobox", { name: "Product / Variant" }).click();
    await page.getByPlaceholder("Product, variant or size...").fill("black pearl");
    await page.getByRole("option", { name: /Black Pearl · Grade 1 · 4×2 ft, 16mm/ }).click();
    await page.getByTestId("fifo-batch").nth(0).click();
    await page.getByLabel("Quantity Sold").fill("1");
    await page.getByLabel("Stone Sale Price (₹)").fill("1650");
    await page.getByRole("button", { name: "Record Sale" }).click();
    await expect(page.getByText(/Sale recorded: 1 from BP-OLD-01/)).toBeVisible();

    await page.getByRole("link", { name: "Yard Slots" }).click();
    await expect(old).toContainText("Available:6");
  });
});
