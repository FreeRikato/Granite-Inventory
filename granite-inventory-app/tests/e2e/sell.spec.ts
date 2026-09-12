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
  await sql(`insert into public.customers (name, phone, customer_type) values ('Priya Engineering', '+91 91234 56789', 'ENGINEER')`);
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

test("a punctuated phone opens a phone draft and saves the normalised value", async ({ page, signIn }) => {
  await sql(`delete from public.customers where name = 'Murugan Constructions'`);
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("+91-98765-43210");
  await page.getByRole("option", { name: 'Add customer "+91-98765-43210"' }).click();

  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Phone")).toHaveValue("+919876543210");
  await page.getByLabel("Name").fill("Punctuated Customer");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Contact Number")).toHaveValue("+919876543210");
});

test("phone search returns only the customer whose number contains the typed digits", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("98765");

  await expect(page.getByRole("option", { name: /Murugan Constructions/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Priya Engineering/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: 'Add customer "98765"' })).toBeVisible();
});

test("the Add customer row appears for a genuinely new query", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("Brand New Customer");

  await expect(page.getByRole("option", { name: 'Add customer "Brand New Customer"' })).toBeVisible();
});

test("the Add customer row is hidden when the typed digits belong to a customer", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("919876543210");

  await expect(page.getByRole("option", { name: /Add customer/ })).toHaveCount(0);
});
