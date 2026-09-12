import { confirmDelete, expect, ensureTestUsers, resetDomainData, test } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await sql(`insert into public.suppliers (name) values ('Madurai Quarry')`);
});

test("a blocked Product delete toast names the Product row", async ({ page, signIn }) => {
  await seedYard();
  await signIn("admin");
  await page.goto("/settings");

  const productRow = page.getByTestId("products-row").filter({ hasText: "Jet Black" });
  await productRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();

  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toContainText("Cannot delete Jet Black: batch JB-FIVE-01 still uses it.");
  await expect(toast).not.toContainText("Cannot delete Product:");
});

test("Inward explains a missing Supplier and disables Save Batch until both selections exist", async ({ page, signIn }) => {
  await sql(`insert into public.products (name, abbreviation, category) values ('Missing Supplier Product', 'MSP', 'GRANITE')`);
  await signIn("operator");
  await page.goto("/inward");

  const saveBatch = page.getByRole("button", { name: "Save Batch" });
  await expect(saveBatch).toBeDisabled();

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /^Missing Supplier Product/ }).click();
  await page.getByRole("combobox", { name: "Variant Name" }).click();
  await page.getByPlaceholder("Search variants...").fill("Grade 1");
  await page.getByRole("option", { name: 'Add variant "Grade 1"' }).click();
  await expect(saveBatch).toBeDisabled();

  await page.locator("form").first().evaluate((form) => {
    if (!(form instanceof HTMLFormElement)) throw new Error("Inward form was not found");
    form.requestSubmit();
  });
  await expect(page.getByText("Pick a supplier", { exact: true })).toBeVisible();
  await expect(page.getByText(/expected string, received null/i)).toHaveCount(0);

  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Madurai Quarry", exact: true }).click();
  await expect(saveBatch).toBeEnabled();
});

test("a Product filter resets to All when its only Batch is deleted", async ({ page, signIn }) => {
  await seedYard();
  await sql(`insert into public.products (name, abbreviation, category) values ('Filter Target', 'FT', 'GRANITE')`);
  const productRows = await sql<{ id: string }>(`select id from public.products where name = 'Filter Target'`);
  const productId = productRows[0]?.id;
  if (!productId) throw new Error("Filter Target was not inserted");
  await sql(`insert into public.variants (product_id, name) values ($1, 'Plain')`, [productId]);
  await sql(`
    insert into public.batches (
      batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm,
      slot, initial_units, units_sold, unit_purchase_price, freight_cost
    )
    select 'FT-ONLY-01', v.id, s.id, private.ist_today(), 4, 2, 16, '4FT', 5, 0, 1000, 0
    from public.variants v
    join public.suppliers s on s.name = 'Madurai Quarry'
    where v.product_id = $1 and v.name = 'Plain'
  `, [productId]);

  await signIn("admin");
  await page.goto("/yard?slot=4FT");
  const productFilter = page.getByRole("combobox", { name: "Product" });
  await productFilter.click();
  await page.getByRole("option", { name: /^Filter Target/ }).click();
  await expect(productFilter).toHaveText(/Product:\s*Filter Target/);

  const batch = page.getByTestId("yard-batch").filter({ hasText: "FT-ONLY-01" });
  await confirmDelete(page, batch.getByRole("button", { name: "Delete" }));
  await expect(batch).toHaveCount(0);
  await expect(productFilter).toHaveText(/Product:\s*All/);
  await expect(page.locator("body")).not.toContainText(productId);
});
