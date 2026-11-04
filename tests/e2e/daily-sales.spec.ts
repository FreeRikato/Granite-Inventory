import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '9843012345', 'CONTRACTOR')`,
  );
});

test("a Sale shows on today's Daily Sales, not the day before, and an Admin can delete it there", async ({
  page,
  signIn,
}) => {
  await signIn("admin");

  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Murugan Constructions/ }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
  await page.getByLabel("Quantity Sold").fill("4");
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("button", { name: "Record Sale" }).click();
  await expect(page.getByText(/Sale recorded/)).toBeVisible();

  await page.goto("/sales");
  await expect(page.getByTestId("daily-billed")).toHaveText("₹6,600");
  await expect(page.getByTestId("daily-received")).toHaveText("₹6,600");
  await expect(page.getByTestId("bill-row")).toContainText("Murugan Constructions");
  await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/\/sales\?date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText("No sales on this day")).toBeVisible();
  await expect(page.getByTestId("daily-billed")).toHaveText("₹0");

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/sales$/);
  await page.getByRole("button", { name: "Delete bill" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Delete/ })
    .click();
  await expect(page.getByText("No sales on this day")).toBeVisible();
  await expect(page.getByTestId("daily-billed")).toHaveText("₹0");
});
