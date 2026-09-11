import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await sql(`insert into public.suppliers (name) values ('Madurai Quarry')`);
});

test("operator logs a delivery with a new product and sees it listed", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/inward");
  await expect(page.getByRole("heading", { name: "Inward Stock" })).toBeVisible();

  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Madurai Quarry" }).click();

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByPlaceholder("Search products...").fill("Black Pearl");
  await page.getByRole("option", { name: /Add product "Black Pearl"/ }).click();
  await expect(page.getByRole("dialog", { name: "New product" })).toBeVisible();
  await expect(page.getByLabel("Abbreviation")).toHaveValue("BP");
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByLabel("Variant Name").fill("Grade 1");
  await page.getByLabel("Length (ft)").fill("4");
  await page.getByLabel("Breadth (ft)").fill("2");
  await page.getByLabel("Thickness (mm)").fill("16");
  await page.getByLabel("Unit Quantity").fill("15");
  await page.getByLabel("Unit Purchase Price (₹)").fill("1400");
  await page.getByLabel("Misc / Freight Cost (₹)").fill("750");

  await expect(page.getByRole("combobox", { name: "Yard slot" })).toHaveText("4 ft Slot");
  await expect(page.getByTestId("batch-code-preview")).toHaveText(/^BP-\d{2}[A-Z]{3}\d{2}-01$/);

  await page.getByRole("button", { name: "Save Batch" }).click();
  await expect(page.getByText(/Batch BP-.* saved/)).toBeVisible();

  const row = page.getByTestId("batch-row").first();
  await expect(row).toContainText("Black Pearl · Grade 1");
  await expect(row).toContainText("4×2 ft, 16mm");
  await expect(row).toContainText("15 / 15");
  await expect(row).toContainText("₹1,450");
});

test("the form refuses a batch without size for granite", async ({ page, signIn }) => {
  await sql(`insert into public.products (name, abbreviation, category) values ('Jet Black', 'JB', 'GRANITE')`);
  await signIn("operator");
  await page.goto("/inward");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Madurai Quarry" }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Jet Black" }).click();
  await page.getByLabel("Variant Name").fill("Premium");
  await page.getByLabel("Unit Quantity").fill("5");
  await page.getByLabel("Unit Purchase Price (₹)").fill("1000");
  await page.getByRole("button", { name: "Save Batch" }).click();
  await expect(page.getByRole("alert").or(page.getByText(/Must be more than 0/))).toBeVisible();
});
