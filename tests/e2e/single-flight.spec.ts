import { expect, test, ensureTestUsers, openDialog } from "./fixtures";
import { sql } from "../seam/harness";

const TAG = `sf${Date.now().toString(36)}`;

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.afterAll(async () => {
  await sql(`delete from public.customers where name like $1`, [`${TAG}%`]);
  await sql(`delete from public.suppliers where name like $1`, [`${TAG}%`]);
  await sql(`delete from public.products where name like $1`, [`${TAG}%`]);
});

test("three same-tick submits of the customer dialog create one customer", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/customers");
  await openDialog(page, page.getByRole("button", { name: "Add Customer" }));
  await page.getByLabel("Name").fill(`${TAG} customer`);
  await page.getByRole("button", { name: "Add customer" }).evaluate((button: HTMLElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  const rows = await sql(`select id from public.customers where name = $1`, [`${TAG} customer`]);
  expect(rows).toHaveLength(1);
});

test("three same-tick submits of the supplier and product dialogs create one each", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/inward");

  await page.getByRole("button", { name: "Add new supplier" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`${TAG} supplier`);
  await page.getByRole("button", { name: "Add supplier" }).evaluate((button: HTMLElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  const suppliers = await sql(`select id from public.suppliers where name = $1`, [`${TAG} supplier`]);
  expect(suppliers).toHaveLength(1);

  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`${TAG} product`);
  await page.getByLabel("Abbreviation").fill("ZZ");
  await page.getByRole("button", { name: "Add product" }).evaluate((button: HTMLElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  const products = await sql(`select id from public.products where name = $1`, [`${TAG} product`]);
  expect(products).toHaveLength(1);
});
