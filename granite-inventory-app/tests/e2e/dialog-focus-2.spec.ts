import { expect, openDialog, resetDomainData, test, ensureTestUsers } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("New Customer from Sell returns focus to the Customer combobox after Escape", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/sell");

  const trigger = page.locator("#customer");
  await trigger.click();
  await page.getByPlaceholder("Name or phone...").fill("Escape customer");
  await openDialog(page, page.getByRole("option", { name: 'Add customer "Escape customer"' }));
  await page.keyboard.press("Escape");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("Add customer from Customers returns focus to its opener after Escape", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");

  const trigger = page.getByRole("button", { name: "Add Customer", exact: true });
  await openDialog(page, trigger);
  await page.keyboard.press("Escape");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("Edit customer from the detail page returns focus to its opener after Escape", async ({ page, signIn }) => {
  const [customer] = await sql<{ readonly id: string }>(
    `insert into public.customers (name, customer_type) values ('Focus Customer', 'REGULAR') returning id`,
  );
  if (!customer) throw new Error("customer seed did not return an id");

  await signIn("admin");
  await page.goto(`/customers/${customer.id}`);

  const trigger = page.getByRole("button", { name: "Edit", exact: true });
  await openDialog(page, trigger);
  await page.keyboard.press("Escape");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("saving a new customer from Sell returns focus to the Customer combobox", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/sell");

  const trigger = page.locator("#customer");
  await trigger.click();
  await page.getByPlaceholder("Name or phone...").fill("Saved focus customer");
  await openDialog(page, page.getByRole("option", { name: 'Add customer "Saved focus customer"' }));
  await page.getByLabel("Name").fill("Saved focus customer");
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await expect(trigger).toContainText("Saved focus customer");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("yard Edit Batch returns focus to its new Edit button after moving groups", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/yard?slot=4FT");

  const trigger = page.getByRole("button", { name: "Edit BP-NEW-01", exact: true });
  await openDialog(page, trigger);
  await page.getByLabel("Length (ft)").fill("3");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Batch BP-NEW-01 updated", { exact: true })).toBeVisible();

  const newTrigger = page.getByRole("button", { name: "Edit BP-NEW-01", exact: true });
  await expect(newTrigger).toBeVisible();
  await expect.poll(() => newTrigger.evaluate((element) => document.activeElement === element)).toBe(true);
});
