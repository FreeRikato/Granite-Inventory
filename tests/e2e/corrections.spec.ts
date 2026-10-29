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
  await expect(page.getByLabel("Sale Date")).toBeEditable();
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

test("a bill's sales sit under one collapsed row, each line is editable and deletable, and the row goes with the last line", async ({
  page,
  signIn,
}) => {
  await sql(`with bill as (
      insert into public.bills (customer_id, sale_date, payment_mode)
      select id, private.ist_today() - 1, 'UPI' from public.customers where name = 'Murugan Constructions'
      returning id, customer_id, sale_date, payment_mode
    ), lines (code, quantity) as (values ('BP-NEW-01', 2), ('JB-FIVE-01', 1))
    insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode, bill_id)
    select bill.sale_date, b.id, bill.customer_id, lines.quantity, 1650, b.unit_purchase_price, bill.payment_mode, bill.id
    from bill, lines join public.batches b on b.batch_code = lines.code`);
  await sql(`update public.batches set units_sold = units_sold + 2 where batch_code = 'BP-NEW-01'`);
  await sql(`update public.batches set units_sold = units_sold + 1 where batch_code = 'JB-FIVE-01'`);

  await signIn("admin");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan" }).click();

  const bill = page.getByTestId("bill-row");
  await expect(bill).toHaveCount(1);
  await expect(bill).toContainText("2 items");
  await expect(bill).toContainText("₹4,950");
  await expect(page.locator('[data-testid="bill-row"], [data-testid="sale-row"]').first()).toHaveAttribute(
    "data-testid",
    "bill-row",
  );
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(page.getByTestId("sale-row")).toContainText("BP-OLD-01");

  await bill.getByRole("button", { name: /2 items/ }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(3);
  await openDialog(page, page.getByRole("button", { name: "Edit sale of BP-NEW-01" }));
  await expect(page.getByLabel("Misc Expense (₹)")).toHaveCount(0);
  await expect(page.getByLabel("Customer")).toHaveValue("Murugan Constructions");
  await expect(page.getByLabel("Customer")).not.toBeEditable();
  await expect(page.getByLabel("Sale Date")).not.toBeEditable();
  await expect(page.getByLabel("Payment Mode")).toHaveValue("UPI");
  await expect(page.getByLabel("Payment Mode")).not.toBeEditable();
  await expect(page.getByLabel("Quantity")).toBeEditable();
  await page.getByLabel("Quantity").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Sale updated")).toBeVisible();
  await expect(bill).toContainText("₹6,600");

  await confirmDelete(page, page.getByRole("button", { name: "Delete" }).first());
  await expect(page.getByText(/Sale deleted/)).toBeVisible();
  await expect(bill.getByRole("button", { name: "1 item", exact: true })).toBeVisible();
  await confirmDelete(page, page.getByRole("button", { name: "Delete" }).first());
  await expect(bill).toHaveCount(0);
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(page.getByTestId("sale-row")).toContainText("BP-OLD-01");
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
