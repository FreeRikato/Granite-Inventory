import type { Locator } from "@playwright/test";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { signedInClient, sql } from "../seam/harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordBill } from "../seam/fixtures";

function firstLine(cell: Locator) {
  return cell.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
    return { left: Math.round(rect?.left ?? 0), middle: Math.round((rect?.top ?? 0) + (rect?.height ?? 0) / 2) };
  });
}

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
  await expect(page.getByTestId("daily-sqft")).toHaveText("32 sq ft");
  await expect(page.getByTestId("customer-sqft")).toHaveText(/Murugan Constructions.*32 sq ft/);
  await expect(page.getByTestId("daily-received")).toHaveText("₹6,600");
  await expect(page.getByTestId("bill-row")).toContainText("Murugan Constructions");
  await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/\/sales\?date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText("No sales on this day")).toBeVisible();
  await expect(page.getByTestId("daily-billed")).toHaveText("₹0");
  await expect(page.getByTestId("daily-sqft")).toHaveText("0 sq ft");
  await expect(page.getByTestId("customer-sqft")).toHaveCount(0);

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

test("an open Bill sums its Sales and reads in the same columns as them", async ({ page, signIn, isMobile }) => {
  test.skip(isMobile, "columns exist only on the table layout");
  const db = await signedInClient("admin");
  const product = await createProduct(db, { name: "Column Slab", abbreviation: "CS" });
  const supplier = await createSupplier(db, "Column Quarry");
  const batch = await createBatch(db, {
    productId: product,
    supplierId: supplier,
    length: 3,
    breadth: 2,
    thickness: 16,
    units: 20,
    unitPrice: 96,
    purchaseDate: daysAgo(5),
  });
  const customerId = await createCustomer(db, { name: "Selvam Traders", phone: "9843012399" });
  const batchId = batch.data?.id ?? "";
  const recorded = await recordBill(db, {
    customerId,
    payments: [],
    onCredit: true,
    payBy: daysAgo(-7),
    lines: [
      { batchId, quantity: 1, saleRate: 135 },
      { batchId, quantity: 8, saleRate: 135 },
    ],
  });
  if (recorded.error) throw recorded.error;

  await signIn("admin");
  await page.goto("/sales");
  await expect(page.getByRole("columnheader", { name: "Purchase code" })).toBeVisible();
  const picker = page.getByTestId("day-picker");
  expect((await picker.getByRole("button", { name: "Previous day" }).boundingBox())?.height).toBe(36);
  expect((await picker.getByLabel("Day", { exact: true }).boundingBox())?.height).toBe(36);
  const kpis = await page
    .getByTestId("daily-summary")
    .locator(":scope > div")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(kpis[1]).toBe(kpis[0]);
  expect(kpis[2]).toBe(kpis[0]);
  expect(kpis[4]).toBe(kpis[0]);
  expect(kpis[3]).toBeGreaterThan(kpis[0] ?? 0);
  const toggle = page.getByRole("button", { name: "2 items" });
  await toggle.click();

  const bill = page.getByTestId("bill-row");
  const cells = bill.getByRole("cell");
  await expect(cells).toHaveCount(6);
  await expect(cells.nth(2)).toHaveText("Qty9");
  await expect(cells.nth(3)).toHaveText("Total₹7,290");
  await expect(cells.nth(4)).toHaveText("Margin₹2,106(28.9%)");

  const middle = (await firstLine(cells.nth(3))).middle;
  expect((await firstLine(cells.nth(0))).middle).toBe(middle);
  expect((await firstLine(toggle)).middle).toBe(middle);
  expect((await firstLine(cells.nth(4))).middle).toBe(middle);
  const deleteBill = await bill.getByRole("button", { name: "Delete bill" }).boundingBox();
  expect(Math.round((deleteBill?.y ?? 0) + (deleteBill?.height ?? 0) / 2)).toBe(middle);

  const sale = page.getByTestId("sale-row").first();
  const edit = await sale.getByRole("button", { name: /Edit/ }).boundingBox();
  const remove = await sale.getByRole("button", { name: "Delete" }).boundingBox();
  expect(edit?.height).toBe(remove?.height);
  expect(edit?.y).toBe(remove?.y);

  const stone = await firstLine(sale.getByRole("cell").nth(1));
  const itemCount = await toggle.evaluate((el) => {
    const range = document.createRange();
    range.selectNode(el.lastChild as Node);
    return Math.round(range.getBoundingClientRect().left);
  });
  expect(stone.left).toBe(itemCount);
});

test("a Customer who bought only Memorial reads Memorial only, not zero square feet", async ({ page, signIn }) => {
  const db = await signedInClient("admin");
  const doom = await createProduct(db, { name: "Doom Cross", abbreviation: "DC", category: "MEMORIAL" });
  const supplierId = await createSupplier(db, "Doom Quarry");
  const batch = await createBatch(db, {
    productId: doom,
    supplierId,
    length: null,
    units: 5,
    purchaseDate: daysAgo(5),
  });
  const customerId = await createCustomer(db, { name: "Temple Trust", phone: "9843012377" });
  const recorded = await recordBill(db, { customerId, lines: [{ batchId: batch.data?.id ?? "", quantity: 2 }] });
  if (recorded.error) throw recorded.error;

  await signIn("admin");
  await page.goto("/sales");
  await expect(page.getByTestId("customer-sqft")).toHaveText(/Temple Trust.*Memorial only/);
  await expect(page.getByTestId("daily-sqft")).toHaveText("0 sq ft");
});
