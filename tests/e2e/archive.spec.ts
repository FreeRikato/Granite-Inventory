import { expect, test, confirmDelete, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
});

test("an admin archives a batch with sales, finds it behind Show archived and unarchives it", async ({
  page,
  signIn,
}) => {
  await seedYard();
  await signIn("admin");
  await page.goto("/yard?slot=4FT");

  const card = page.getByTestId("yard-batch").filter({ hasText: "BP-OLD-01" });
  const archive = card.getByRole("button", { name: "Archive BP-OLD-01", exact: true });
  await expect(async () => {
    if (await archive.isVisible()) await archive.click();
    await expect(page.getByText("Batch BP-OLD-01 archived")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(card).toHaveCount(0);

  await page.getByRole("switch", { name: "Show archived" }).click();
  await expect(card.getByText("Archived", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "Sell from this Batch" })).toHaveCount(0);

  await card.getByRole("button", { name: "Unarchive BP-OLD-01", exact: true }).click();
  await expect(page.getByText("Batch BP-OLD-01 unarchived")).toBeVisible();
  await expect(card.getByRole("link", { name: "Sell from this Batch" })).toBeVisible();
});

test("a batch can be deleted only after it is archived and only when nothing was sold from it", async ({
  page,
  signIn,
}) => {
  await seedYard();
  await signIn("admin");
  await page.goto("/yard");

  const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
  await expect(card.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await card.getByRole("button", { name: "Archive JB-FIVE-01", exact: true }).click();
  await expect(page.getByText("Batch JB-FIVE-01 archived")).toBeVisible();

  await page.getByRole("switch", { name: "Show archived" }).click();
  await confirmDelete(page, card.getByRole("button", { name: "Delete" }));
  await expect(page.getByText("Batch JB-FIVE-01 deleted")).toBeVisible();
  await expect(card).toHaveCount(0);

  const sold = page.getByTestId("yard-batch").filter({ hasText: "BP-OLD-01" });
  await sold.getByRole("button", { name: "Archive BP-OLD-01", exact: true }).click();
  await expect(page.getByText("Batch BP-OLD-01 archived")).toBeVisible();
  await expect(sold.getByRole("button", { name: "Unarchive BP-OLD-01", exact: true })).toBeVisible();
  await expect(sold.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("an admin edits, archives and deletes from the Inward pickers and types a new yard slot", async ({
  page,
  signIn,
}) => {
  await sql(`insert into public.suppliers (name) values ('Madurai Quarry'), ('Salem Quarry')`);
  await sql(`insert into public.products (name, abbreviation, category) values ('Jet Black', 'JB', 'GRANITE')`);
  await signIn("admin");
  await page.goto("/inward");

  const supplier = page.getByRole("combobox", { name: "Supplier" });
  await supplier.click();
  await page.getByRole("button", { name: "Edit Madurai Quarry" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit supplier" });
  await editDialog.getByLabel("Name", { exact: true }).fill("Madurai Granites");
  await editDialog.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.getByText("Supplier Madurai Granites saved")).toBeVisible();

  await supplier.click();
  await page.getByRole("button", { name: "Archive Salem Quarry" }).click();
  await expect(page.getByText("Salem Quarry archived")).toBeVisible();
  await supplier.click();
  await expect(page.getByRole("option", { name: "Madurai Granites" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Salem Quarry" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await sql(`select name from public.suppliers where archived_at is not null`)).toEqual([
    { name: "Salem Quarry" },
  ]);

  await page.getByRole("combobox", { name: "Product" }).click();
  await confirmDelete(page, page.getByRole("button", { name: "Delete Jet Black" }));
  await expect(page.getByText("Jet Black deleted")).toBeVisible();
  expect(await sql(`select name from public.products`)).toEqual([]);

  await page.getByRole("button", { name: "Add new batch number" }).click();
  const stackDialog = page.getByRole("dialog", { name: "New batch number" });
  await stackDialog.getByRole("combobox", { name: "Yard slot" }).click();
  await page.getByPlaceholder("Search or type a slot...").fill("Back Row");
  await page.getByRole("option", { name: 'Add slot "Back Row"' }).click();
  await stackDialog.getByLabel("Batch number").fill("7");
  await stackDialog.getByRole("button", { name: "Use batch number" }).click();
  await expect(page.getByRole("combobox", { name: "Yard slot and batch number" })).toHaveText("Back Row · 7");
});
