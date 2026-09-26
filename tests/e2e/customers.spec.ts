import { expect, test, ensureTestUsers, openDialog, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`);
  await sql(`insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
    select private.ist_today() - 3, b.id, c.id, 2, 1650, 1450, 'CASH' from public.batches b, public.customers c
    where b.batch_code = 'BP-OLD-01' and c.name = 'Murugan Constructions'`);
  await sql(`update public.batches set units_sold = units_sold + 2 where batch_code = 'BP-OLD-01'`);
});

test("customers list, add, and detail with sales", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByTestId("customer-row")).toHaveCount(2);
  const murugan = page.getByTestId("customer-row").filter({ hasText: "Murugan Constructions" });
  await expect(murugan).toContainText("3 days ago");
  await expect(murugan).toContainText("Contractor");

  await openDialog(page, page.getByRole("button", { name: "Add Customer" }));
  await page.getByLabel("Name").fill("St. Xavier's Trust");
  await page.getByLabel("Phone").fill("+91 90000 11223");
  await page.getByRole("radio", { name: "Trust" }).click();
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByTestId("customer-row")).toHaveCount(3);
  await expect(page.getByTestId("customer-row").filter({ hasText: "St. Xavier" })).toContainText("No purchases");

  await murugan.click();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(page.getByTestId("sale-row")).toContainText("BP-OLD-01");
  await expect(page.getByTestId("sale-row")).toContainText("₹3,300");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("an existing phone selects that customer instead of creating a duplicate", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/customers");
  await openDialog(page, page.getByRole("button", { name: "Add Customer" }));
  await page.getByLabel("Name").fill("Someone Else");
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByText(/Murugan Constructions already has that phone number/)).toBeVisible();
  await expect(page.getByTestId("customer-row")).toHaveCount(2);
});
