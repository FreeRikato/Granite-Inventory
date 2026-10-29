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

  await page.getByLabel("Length (ft)").fill("4");
  await page.getByLabel("Breadth (ft)").fill("2");
  await expect(page.getByLabel("Area (sq ft)")).toHaveValue("8");
  await page.getByLabel("Thickness (mm)").fill("16");
  await page.getByLabel("Unit Quantity").fill("15");
  await expect(page.getByLabel("Freight Cost")).toHaveCount(0);
  await expect(page.getByText("Per sq ft, freight included")).toBeVisible();
  await page.getByLabel("Unit Purchase Price (₹)").fill("181.25");

  await page.getByRole("button", { name: "Add new batch number" }).click();
  const stackDialog = page.getByRole("dialog", { name: "New batch number" });
  await expect(stackDialog.getByRole("combobox", { name: "Yard slot" })).toHaveText("4 ft Slot");
  await stackDialog.getByLabel("Batch number").fill("12");
  await stackDialog.getByRole("button", { name: "Use batch number" }).click();
  await expect(page.getByRole("combobox", { name: "Yard slot and batch number" })).toHaveText("4 ft Slot · 12");
  await expect(page.getByTestId("batch-code-preview")).toHaveText(/^BP-\d{2}[A-Z]{3}\d{2}-01$/);

  await page.getByRole("button", { name: "Save Batch" }).click();
  await expect(page.getByText(/Batch BP-.* saved/)).toBeVisible();

  const row = page.getByTestId("batch-row").first();
  await expect(row).toContainText("Black Pearl");
  await expect(row).toContainText("4×2 ft, 16mm");
  await expect(row).toContainText("15 / 15");
  await expect(row).toContainText("₹1,450");
  await expect(row).toContainText("4 ft Slot · 12");
  const headers = page.getByRole("columnheader");
  const landedIndex = (await headers.allTextContents()).indexOf("Landed cost");
  await expect(headers.nth(landedIndex + 1)).toHaveText("Total cost");
  await expect(row.getByRole("cell").nth(landedIndex)).toHaveText("₹1,450");
  await expect(row.getByRole("cell").nth(landedIndex + 1)).toHaveText("₹21,750");

  await page.getByRole("combobox", { name: "Yard slot and batch number" }).click();
  await page.getByRole("option", { name: "4 ft Slot · 12" }).click();
  await expect(page.getByRole("combobox", { name: "Yard slot and batch number" })).toHaveText("4 ft Slot · 12");
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
  await page.getByLabel("Unit Quantity").fill("5");
  await page.getByLabel("Unit Purchase Price (₹)").fill("1000");
  await page.getByRole("combobox", { name: "Yard slot and batch number" }).click();
  await page.getByPlaceholder("Search batch numbers...").fill("3");
  await page.getByRole("option", { name: 'Add batch number "3"' }).click();
  await page.getByRole("button", { name: "Use batch number" }).click();

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

test("Recent batches hides archived batches until Show archived is on, and only then offers Delete", async ({
  page,
  signIn,
}) => {
  await seedYard();
  await signIn("admin");
  await page.goto("/inward");
  const row = page.getByTestId("batch-row").filter({ hasText: "JB-FIVE-01" });
  await row.getByRole("button", { name: "Archive JB-FIVE-01" }).click();
  await expect(page.getByText("Batch JB-FIVE-01 archived")).toBeVisible();
  await expect(row).toHaveCount(0);

  await page.getByRole("switch", { name: "Show archived" }).click();
  await expect(row).toContainText("Archived");
  await expect(row.getByRole("cell", { name: "₹14,400" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Unarchive JB-FIVE-01" })).toBeVisible();
  await confirmDelete(page, row.getByRole("button", { name: "Delete JB-FIVE-01" }));
  await expect(page.getByText("Batch JB-FIVE-01 deleted")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("an admin edits a batch from Recent batches, which offers no Delete while it is live, and an operator sees neither", async ({
  page,
  signIn,
}) => {
  await seedYard();
  await signIn("admin");
  await page.goto("/inward");
  const row = page.getByTestId("batch-row").filter({ hasText: "JB-FIVE-01" });
  await openDialog(page, row.getByRole("button", { name: "Edit JB-FIVE-01" }));
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Freight Cost")).toHaveCount(0);
  await dialog.getByLabel("Unit Quantity").fill("8");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Batch JB-FIVE-01 updated")).toBeVisible();
  await expect(row).toContainText("/ 8");

  await expect(row.getByRole("button", { name: "Archive JB-FIVE-01" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Delete JB-FIVE-01" })).toHaveCount(0);

  await page.request.post("/auth/signout");
  await signIn("operator");
  await page.goto("/inward");
  await expect(page.getByTestId("batch-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
});
