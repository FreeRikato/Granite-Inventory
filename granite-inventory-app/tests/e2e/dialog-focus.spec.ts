import { expect, openDialog, openPalette, resetDomainData, test, ensureTestUsers } from "./fixtures";
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

test("yard batch Edit returns focus after Escape", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/yard?slot=5FT");

  const trigger = page.getByRole("button", { name: "Edit JB-FIVE-01" });
  await openDialog(page, trigger);
  await page.keyboard.press("Escape");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("customer detail Edit sale returns focus after Escape", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan Constructions" }).click();

  const trigger = page.getByRole("button", { name: "Edit sale of BP-OLD-01" });
  await openDialog(page, trigger);
  await page.keyboard.press("Escape");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("command palette opened by its button returns focus to that button", async ({ page, signIn }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the command palette is desktop only");
  await signIn("operator");
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Search or jump to" });
  await openDialog(page, trigger);
  await expect(page.getByRole("dialog", { name: "Search or jump to" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("command palette opened with Cmd or Ctrl K returns focus to the active control", async ({ page, signIn }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the command palette is desktop only");
  await signIn("operator");
  await page.goto("/");

  const control = page.getByRole("link", { name: "Yard Slots" });
  await control.focus();
  await expect(control).toBeFocused();
  await openPalette(page);
  await page.keyboard.press("Escape");

  await expect.poll(() => control.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("yard batch Edit returns focus after completing the edit", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/yard?slot=5FT");

  const trigger = page.getByRole("button", { name: "Edit JB-FIVE-01" });
  await openDialog(page, trigger);
  await page.getByLabel("Unit Quantity").fill("8");
  await page.getByLabel("Unit Purchase Price (₹)").fill("2500");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Batch JB-FIVE-01 updated")).toBeVisible();

  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("Sell Stone date picker is a labeled native date input that retains focus when dismissed", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");

  const dateInput = page.getByLabel("Sale Date");
  await expect(dateInput).toHaveAttribute("type", "date");
  await dateInput.click();
  await page.keyboard.press("Escape");

  await expect.poll(() => dateInput.evaluate((element) => document.activeElement === element)).toBe(true);
});
