import { expect, test, confirmDelete, ensureTestUsers, openDialog, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`,
  );
  await sql(`insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
    select private.ist_today() - 3, b.id, c.id, 2, 1650, 1450, 'CASH' from public.batches b, public.customers c
    where b.batch_code = 'BP-OLD-01' and c.name = 'Murugan Constructions'`);
  await sql(`update public.batches set units_sold = units_sold + 2 where batch_code = 'BP-OLD-01'`);
});

test("admin edits a batch from the yard and a sale from the customer page", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/yard?slot=5FT");
  await openDialog(page, page.getByRole("button", { name: "Edit JB-FIVE-01" }));
  await expect(page.getByLabel("Freight Cost")).toHaveCount(0);
  await expect(page.getByLabel("Area (sq ft)")).toHaveValue("15");
  await page.getByLabel("Unit Quantity").fill("8");
  await page.getByLabel("Unit Purchase Price (₹)").fill("2500");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Batch JB-FIVE-01 updated")).toBeVisible();
  await expect(page.locator('[data-batch-code="JB-FIVE-01"]')).toContainText("Bought:8");

  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan" }).click();
  await openDialog(page, page.getByRole("button", { name: "Edit sale of BP-OLD-01" }));
  await expect(page.getByLabel("Misc Expense (₹)")).toHaveCount(0);
  await page.getByLabel("Quantity").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Sale updated")).toBeVisible();
  await expect(page.getByTestId("sale-row")).toContainText("₹4,950");

  await page.goto("/yard?slot=4FT");
  await expect(page.locator('[data-batch-code="BP-OLD-01"]')).toContainText("Sold:11");

  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan" }).click();
  await confirmDelete(page, page.getByRole("button", { name: "Delete" }).first());
  await expect(page.getByText(/Sale deleted/)).toBeVisible();
  await expect(page.getByText("No sales recorded for this customer.")).toBeVisible();
});

test("switching a batch between a sized and a Memorial product clears its price, since one is per sq ft and the other per piece", async ({
  page,
  signIn,
}) => {
  await signIn("admin");
  await page.goto("/yard?slot=5FT");
  await openDialog(page, page.getByRole("button", { name: "Edit JB-FIVE-01" }));
  const price = page.getByLabel("Unit Purchase Price (₹)");
  await expect(price).toHaveValue("160");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Black Pearl" }).click();
  await expect(price).toHaveValue("160");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Doom Stone" }).click();
  await expect(price).toHaveValue("");
  await expect(page.getByText("Per piece, freight included")).toBeVisible();
});

test("a batch with sales cannot be deleted, an unsold one only after archiving, and an operator sees no correction controls", async ({
  page,
  signIn,
}) => {
  await signIn("admin");
  await page.goto("/yard?slot=4FT");
  const old = page.locator('[data-batch-code="BP-OLD-01"]');
  await expect(old.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.locator('[data-batch-code="BP-NEW-01"]').getByRole("button", { name: "Delete" })).toHaveCount(0);

  await page.goto("/yard?slot=5FT");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.getByRole("button", { name: "Archive JB-FIVE-01", exact: true }).click();
  await expect(page.getByText("Batch JB-FIVE-01 archived")).toBeVisible();
  await page.getByRole("switch", { name: "Show archived" }).click();
  await confirmDelete(page, page.getByRole("button", { name: "Delete" }));
  await expect(page.getByText("Batch JB-FIVE-01 deleted")).toBeVisible();

  await page.request.post("/auth/signout");
  await signIn("operator");
  await page.goto("/yard?slot=4FT");
  await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
});

test("the Edit sale refusal clears as soon as the quantity is fixed", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan" }).click();
  await openDialog(page, page.getByRole("button", { name: "Edit sale of BP-OLD-01" }));
  await page.getByLabel("Quantity").fill("99");
  await page.getByRole("button", { name: "Save changes" }).click();
  const refusal = page.getByText(/Only \d+ available in batch BP-OLD-01/);
  await expect(refusal).toBeVisible();

  await page.getByLabel("Quantity").fill("3");
  await expect(refusal).toHaveCount(0);
});
