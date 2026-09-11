import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`);
});

test("palette jumps to a stock line in the yard and to a customer; sell deep link preselects the batch", async ({ page, signIn }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the palette is desktop only");
  await signIn("operator");
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Type a page, stone or customer...").fill("jet black");
  await page.getByRole("option", { name: /Jet Black · Premium/ }).click();
  await expect(page).toHaveURL(/\/yard\?slot=5FT&variant=.*&size=5/);
  await expect(page.getByTestId("yard-batch")).toHaveCount(1);
  await expect(page.getByTestId("yard-batch")).toHaveAttribute("data-batch-code", "JB-FIVE-01");

  await page.getByRole("button", { name: "Search or jump to" }).click();
  await page.getByPlaceholder("Type a page, stone or customer...").fill("98765");
  await page.getByRole("option", { name: /Murugan Constructions/ }).click();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();

  await page.goto("/yard?slot=4FT");
  await page.locator('[data-batch-code="BP-OLD-01"]').getByRole("link", { name: "Sell from this Batch" }).click();
  await expect(page).toHaveURL(/\/sell\?batch=/);
  await expect(page.getByRole("combobox", { name: "Product / Variant" })).toContainText("Black Pearl · Grade 1");
  await expect(page.getByTestId("fifo-batch").filter({ hasText: "BP-OLD-01" })).toHaveAttribute("aria-checked", "true");
});

test("mobile: More sheet reaches Customers, Settings and Sign out; manifest is served", async ({ page, signIn }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile only");
  await signIn("operator");
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe("Kirthik Granite");
});
