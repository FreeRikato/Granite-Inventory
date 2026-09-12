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

test("operator sells from the oldest batch and sees margin live, then available drops in the yard", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await expect(page.getByRole("heading", { name: "Sell Stone" })).toBeVisible();

  await page.getByRole("radio", { name: "UPI" }).click();

  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("98765");
  await page.getByRole("option", { name: /Murugan Constructions/ }).click();
  await expect(page.getByLabel("Contact Number")).toHaveValue("+91 98765 43210");

  await page.getByRole("combobox", { name: "Product / Variant" }).click();
  await page.getByPlaceholder("Product, variant or size...").fill("black pearl");
  await page.getByRole("option", { name: /Black Pearl · Grade 1 · 4×2 ft, 16mm/ }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo).toHaveCount(2);
  await expect(fifo.nth(0)).toContainText("BP-OLD-01");
  await expect(fifo.nth(0)).toContainText("232 days");
  await fifo.nth(0).click();

  await page.getByLabel("Quantity Sold").fill("1");
  await page.getByLabel("Stone Sale Price (₹)").fill("1650");
  await expect(page.getByTestId("total-margin")).toHaveText("₹200");
  await expect(page.getByTestId("margin-pct")).toHaveText("12.1%");

  await page.getByRole("switch", { name: "Add Stickering / Engraving Service" }).click();
  await page.getByLabel("Stickering Cost (₹)").fill("100");
  await page.getByLabel("Stickering Price (₹)").fill("250");
  await expect(page.getByTestId("total-margin")).toHaveText("₹350");
  await expect(page.getByTestId("margin-pct")).toHaveText("18.4%");

  await page.getByRole("button", { name: "Record Sale" }).click();
  await expect(page.getByText(/Sale recorded: 1 from BP-OLD-01/)).toBeVisible();

  await page.goto("/yard?slot=4FT");
  const old = page.locator('[data-batch-code="BP-OLD-01"]');
  await expect(old).toContainText("Sold:9");
  await expect(old).toContainText("Available:6");
});

test("choosing a stock line selects its oldest batch and enables Record Sale", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");

  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Walk-in Customer/ }).click();
  await page.getByRole("combobox", { name: "Product / Variant" }).click();
  await page.getByRole("option", { name: /Black Pearl · Grade 1 · 4×2 ft, 16mm/ }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(fifo.nth(0)).toContainText("BP-OLD-01");
  await expect(page.getByRole("button", { name: "Record Sale" })).toBeEnabled();
});

test("switching stock lines moves the default to the new line's oldest batch", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");

  await page.getByRole("combobox", { name: "Product / Variant" }).click();
  await page.getByRole("option", { name: /Black Pearl · Grade 1 · 4×2 ft, 16mm/ }).click();
  await expect(page.getByTestId("fifo-batch").nth(0)).toHaveAttribute("aria-checked", "true");

  await page.getByRole("combobox", { name: "Product / Variant" }).click();
  await page.getByPlaceholder("Product, variant or size...").fill("Jet Black");
  await page.getByRole("option", { name: /Jet Black · Premium · 5×3 ft, 20mm/ }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo).toHaveCount(1);
  await expect(fifo.first()).toHaveAttribute("aria-checked", "true");
  await expect(fifo.first()).toContainText("JB-FIVE-01");
});

test("a deep-linked batch remains selected over the FIFO default", async ({ page, signIn }) => {
  const rows = await sql<{ id: string }>(`select id from public.batches where batch_code = 'BP-NEW-01'`);
  const newBatchId = rows[0]?.id;
  if (!newBatchId) throw new Error("seed batch BP-NEW-01 was not found");
  await signIn("operator");
  await page.goto(`/sell?batch=${newBatchId}`);

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo.nth(0)).toContainText("BP-OLD-01");
  await expect(fifo.nth(1)).toContainText("BP-NEW-01");
  await expect(fifo.nth(0)).toHaveAttribute("aria-checked", "false");
  await expect(fifo.nth(1)).toHaveAttribute("aria-checked", "true");
});

test("selling more than available is refused by the database", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Walk-in Customer/ }).click();
  await page.getByRole("combobox", { name: "Product / Variant" }).click();
  await page.getByRole("option", { name: /Jet Black · Premium/ }).click();
  await page.getByTestId("fifo-batch").first().click();
  await page.getByLabel("Quantity Sold").fill("7");
  await page.getByLabel("Stone Sale Price (₹)").fill("2600");
  await page.getByRole("button", { name: "Record Sale" }).click();
  await expect(page.getByText(/Only 6 available in batch JB-FIVE-01/)).toBeVisible();
});
