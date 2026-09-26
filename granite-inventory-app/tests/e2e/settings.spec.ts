import { expect, test, ensureTestUsers, openDialog, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`delete from public.team_members where email = 'meena@test.local'`);
});

test("admin invites a member, changes thresholds and renames a product", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Signed in with Google")).toBeVisible();

  await openDialog(page, page.getByRole("button", { name: "Invite a Google account" }));
  await page.getByLabel("Google email").fill("Meena@test.local");
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Meena Kumar");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("meena@test.local can now sign in")).toBeVisible();
  await expect(page.getByTestId("member-row").filter({ hasText: "meena@test.local" })).toBeVisible();

  await page.getByRole("radio", { name: "365 days" }).click();
  await expect(page.getByLabel("Stale after (days)")).toHaveValue("365");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Inventory rules saved")).toBeVisible();
  await expect(page.getByText("365 days and over")).toBeVisible();

  await page.goto("/yard?slot=4FT");
  await expect(page.locator('[data-batch-code="BP-OLD-01"]')).toContainText("Ageing · 232 days");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Rename Jet Black" }).click();
  await page.getByLabel("Name for Jet Black").fill("Jet Black Granite");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("products-row").filter({ hasText: "Jet Black Granite" })).toBeVisible();

  const productDelete = page.getByTestId("products-row").filter({ hasText: "Jet Black Granite" }).getByRole("button", { name: "Delete" });
  await productDelete.click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog).toContainText("JB-FIVE-01");
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/JB-FIVE-01/)).toBeVisible();
});

test("names a variant that blocks product deletion", async ({ page, signIn }) => {
  await sql(`
    with product as (
      insert into public.products (name, abbreviation, category)
      values ('Orphan Product', 'OP', 'GRANITE')
      returning id
    )
    insert into public.variants (product_id, name)
    select id, 'Oval' from product
  `);

  await signIn("admin");
  await page.goto("/settings");

  const productRow = page.getByTestId("products-row").filter({ hasText: "Orphan Product" });
  await productRow.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog).toContainText("variant Oval");
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Cannot delete Orphan Product: variant Oval still belongs to it.")).toBeVisible();
});

test("an operator only sees their profile and the read-only rules", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite a Google account" })).toHaveCount(0);
  await expect(page.getByLabel("Stale after (days)")).toHaveCount(0);
  await expect(page.getByText("Team access and inventory rules are managed by an Admin.")).toBeVisible();
});
