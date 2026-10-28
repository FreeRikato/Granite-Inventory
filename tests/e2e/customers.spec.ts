import { expect, test, ensureTestUsers, confirmDelete, openDialog, resetDomainData } from "./fixtures";
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

test("the customer page shows Margin % to one decimal like the other screens", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan" }).click();
  const row = page.getByTestId("sale-row");
  await expect(row).toContainText("(12.1%)");
  await expect(row).not.toContainText("12.12%");
});

test("admin edits a customer from the detail page and the change persists", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan Constructions" }).click();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();

  await openDialog(page, page.getByRole("button", { name: "Edit", exact: true }));
  await page.getByLabel("Name").fill("Murugan Builders");
  await page.getByRole("radio", { name: "Trust" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Customer updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Murugan Builders" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Murugan Builders" })).toBeVisible();
  const [row] = await sql<{ name: string; customer_type: string }>(
    `select name, customer_type from public.customers where name = 'Murugan Builders'`,
  );
  expect(row?.customer_type).toBe("TRUST");
});

test("admin deletes a customer with no sales and returns to the list", async ({ page, signIn }) => {
  const [customer] = await sql<{ readonly id: string }>(
    `insert into public.customers (name, customer_type) values ('Throwaway Customer', 'REGULAR') returning id`,
  );
  if (!customer) throw new Error("customer seed did not return an id");

  await signIn("admin");
  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByRole("heading", { name: "Throwaway Customer" })).toBeVisible();
  await confirmDelete(page, page.getByRole("button", { name: "Delete" }));

  await expect(page.getByText("Customer deleted")).toBeVisible();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByTestId("customer-row").filter({ hasText: "Throwaway Customer" })).toHaveCount(0);
  await expect(page.getByTestId("customer-row").filter({ hasText: "Murugan Constructions" })).toBeVisible();
});

test("an over-long customer name explains the limit once, inline", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/customers");
  await openDialog(page, page.getByRole("button", { name: "Add Customer" }));
  const name = page.getByLabel("Name");
  await expect(name).toHaveAttribute("maxlength", "80");
  await name.pressSequentially("x".repeat(81));
  await expect(name).toHaveValue("x".repeat(80));
  await name.evaluate((input: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, "x".repeat(81));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const add = page.getByRole("button", { name: "Add customer" });
  await add.click();
  await add.click();
  const message = page.getByRole("dialog").getByRole("alert");
  await expect(message).toHaveText("Name must be 80 characters or fewer");
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(page.getByText(/too big|expected string/i)).toHaveCount(0);
  await name.fill("x".repeat(80));
  await expect(message).toHaveCount(0);
});

test("the tiles count every customer past the 1,000 row cap", async ({ page, signIn }) => {
  await sql(
    `insert into public.customers (name, phone, customer_type)
     select 'Tile Customer ' || lpad(n::text, 4, '0'), '+91 8' || lpad(n::text, 9, '0'),
            case when n <= 200 then 'CONTRACTOR' when n <= 500 then 'TRUST' else 'REGULAR' end
     from generate_series(1, 1100) n`,
  );
  await signIn("operator");
  await page.goto("/customers");
  const tile = (label: string) => page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd");
  await expect(tile("Total Customers")).toHaveText("1102");
  await expect(tile("Contractors")).toHaveText("201");
  await expect(tile("Trusts")).toHaveText("300");
});
