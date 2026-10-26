import { expect, test, confirmDelete, ensureTestUsers, openDialog, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
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

  await page.getByRole("combobox", { name: "Variant Name" }).click();
  await page.getByPlaceholder("Search variants...").fill("Grade 1");
  await page.getByRole("option", { name: 'Add variant "Grade 1"' }).click();
  await page.getByLabel("Length (ft)").fill("4");
  await page.getByLabel("Breadth (ft)").fill("2");
  await page.getByLabel("Thickness (mm)").fill("16");
  await page.getByLabel("Unit Quantity").fill("15");
  await page.getByLabel("Unit Purchase Price (₹)").fill("1400");
  await page.getByLabel("Freight Cost (₹)").fill("750");

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

test("the Add buttons open the supplier and product dialogs and select what they save", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/inward");

  await page.getByRole("button", { name: "Add new supplier" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Erode Granites");
  await page.getByLabel("Phone").fill("9876500000");
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByRole("combobox", { name: "Supplier" })).toHaveText("Erode Granites");
  const suppliers = await sql<{ phone: string }>(`select phone from public.suppliers where name = 'Erode Granites'`);
  expect(suppliers).toEqual([{ phone: "9876500000" }]);

  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Jet Black");
  await expect(page.getByLabel("Abbreviation")).toHaveValue("JB");
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("combobox", { name: "Product" })).toHaveText("Jet Black");
});

test("operator adds a new supplier inline and it is selected and saved", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/inward");

  const supplier = page.getByRole("combobox", { name: "Supplier" });
  await supplier.click();
  await page.getByPlaceholder("Search suppliers...").fill("Salem Quarry");
  await page.getByRole("option", { name: 'Add supplier "Salem Quarry"' }).click();
  await expect(page.getByRole("dialog", { name: "New supplier" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Salem Quarry");
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(supplier).toHaveText("Salem Quarry");

  const rows = await sql<{ name: string }>(`select name from public.suppliers where name = 'Salem Quarry'`);
  expect(rows).toHaveLength(1);

  await supplier.click();
  await expect(page.getByRole("option", { name: "Salem Quarry" })).toBeVisible();
});

test("Save Batch waits for a positive size on granite and the click still refuses a zero", async ({ page, signIn }) => {
  await sql(`insert into public.products (name, abbreviation, category) values ('Jet Black', 'JB', 'GRANITE')`);
  await signIn("operator");
  await page.goto("/inward");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Madurai Quarry" }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Jet Black" }).click();
  await page.getByRole("combobox", { name: "Variant Name" }).click();
  await page.getByPlaceholder("Search variants...").fill("Premium");
  await page.getByRole("option", { name: 'Add variant "Premium"' }).click();
  await page.getByLabel("Unit Quantity").fill("5");
  await page.getByLabel("Unit Purchase Price (₹)").fill("1000");

  const saveBatch = page.getByRole("button", { name: "Save Batch" });
  await expect(saveBatch).toBeDisabled();
  await page.getByLabel("Length (ft)").fill("4");
  await expect(saveBatch).toBeDisabled();
  await page.getByLabel("Breadth (ft)").fill("2");
  await expect(saveBatch).toBeEnabled();

  await page.getByLabel("Thickness (mm)").fill("0");
  await saveBatch.click();
  await expect(page.getByText(/Must be more than 0/)).toBeVisible();
  await expect(page.getByTestId("batch-row")).toHaveCount(0);

  await page.getByLabel("Thickness (mm)").fill("16");
  await expect(page.getByText(/Must be more than 0/)).toHaveCount(0);
});

test("inward suggests an existing variant for the chosen product and accepts a new name", async ({ page, signIn }) => {
  await sql(`insert into public.products (name, abbreviation, category) values ('Black Pearl', 'BP', 'GRANITE')`);
  await sql(`insert into public.variants (product_id, name)
    select id, 'Grade 1' from public.products where name = 'Black Pearl'`);
  await signIn("operator");
  await page.goto("/inward");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Black Pearl" }).click();

  const variant = page.getByRole("combobox", { name: "Variant Name" });
  await variant.click();
  await expect(page.getByRole("option", { name: "Grade 1" })).toBeVisible();
  await page.getByRole("option", { name: "Grade 1" }).click();
  await expect(variant).toHaveText("Grade 1");

  await variant.click();
  await page.getByPlaceholder("Search variants...").fill("New Finish");
  await page.getByRole("option", { name: 'Add variant "New Finish"' }).click();
  await expect(variant).toHaveText("New Finish");
});

test("an admin edits and deletes a batch from Recent batches and an operator sees neither", async ({
  page,
  signIn,
}) => {
  await seedYard();
  await signIn("admin");
  await page.goto("/inward");
  const row = page.getByTestId("batch-row").filter({ hasText: "JB-FIVE-01" });
  await openDialog(page, row.getByRole("button", { name: "Edit JB-FIVE-01" }));
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Unit Quantity").fill("8");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Batch JB-FIVE-01 updated")).toBeVisible();
  await expect(row).toContainText("/ 8");

  await confirmDelete(page, row.getByRole("button", { name: "Delete JB-FIVE-01" }));
  await expect(page.getByText("Batch JB-FIVE-01 deleted")).toBeVisible();
  await expect(row).toHaveCount(0);

  await page.request.post("/auth/signout");
  await signIn("operator");
  await page.goto("/inward");
  await expect(page.getByTestId("batch-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
});
