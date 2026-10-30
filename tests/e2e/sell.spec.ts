import type { Page } from "@playwright/test";
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
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`,
  );
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Priya Engineering', '+91 91234 56789', 'ENGINEER')`,
  );
});

async function chooseCustomer(page: Page, name: RegExp) {
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name }).click();
}

async function addLine(
  page: Page,
  product: RegExp,
  quantity: string,
  price: string,
  options: { batchCode?: string; stickering?: { cost: string; price: string } } = {},
) {
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: product }).click();
  if (options.batchCode) {
    await page.getByTestId("fifo-batch").filter({ hasText: options.batchCode }).click();
  }
  await page.getByLabel("Quantity Sold").fill(quantity);
  await page.getByLabel("Stone Sale Price (₹)").fill(price);
  if (options.stickering) {
    await page.getByRole("switch", { name: "Add Stickering / Engraving Service" }).click();
    await page.getByLabel("Stickering Cost (₹)").fill(options.stickering.cost);
    await page.getByLabel("Stickering Price (₹)").fill(options.stickering.price);
  }
  await page.getByRole("button", { name: "Add to order" }).click();
}

const BLACK_PEARL = /Black Pearl · 4×2 ft, 16mm/;
const JET_BLACK = /Jet Black · 5×3 ft, 20mm/;
const DOOM_STONE = /Doom Stone/;

test("operator sells from the oldest batch and sees margin live, then available drops in the yard", async ({
  page,
  signIn,
}) => {
  await signIn("operator");
  await page.goto("/sell");
  await expect(page.getByRole("heading", { name: "Sell Stone" })).toBeVisible();
  await expect(page.getByLabel("Misc Expense (₹)")).toHaveCount(0);
  await expect(page.getByTestId("order-summary")).not.toContainText("Misc Expense");

  await page.getByRole("radio", { name: "UPI" }).click();

  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("98765");
  await page.getByRole("option", { name: /Murugan Constructions/ }).click();
  await expect(page.getByLabel("Contact Number")).toHaveValue("+91 98765 43210");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByPlaceholder("Product or size...").fill("black pearl");
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo).toHaveCount(2);
  await expect(fifo.nth(0)).toContainText("BP-OLD-01");
  await expect(fifo.nth(0)).toContainText("232 days");
  await fifo.nth(0).click();

  await page.getByLabel("Quantity Sold").fill("1");
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByTestId("order-count")).toHaveText("1 line · 1 piece");
  await expect(page.getByTestId("total-margin")).toHaveText("₹200");
  await expect(page.getByTestId("margin-pct")).toHaveText("12.1%");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();
  await page.getByTestId("fifo-batch").nth(0).click();
  await page.getByLabel("Quantity Sold").fill("1");
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("switch", { name: "Add Stickering / Engraving Service" }).click();
  await page.getByLabel("Stickering Cost (₹)").fill("100");
  await page.getByLabel("Stickering Price (₹)").fill("250");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("order-summary")).toContainText("Stickering Margin");
  await expect(page.getByTestId("total-margin")).toHaveText("₹550");
  await expect(page.getByTestId("margin-pct")).toHaveText("15.5%");
  await page.getByRole("button", { name: "Remove Black Pearl BP-OLD-01" }).first().click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("total-margin")).toHaveText("₹350");
  await expect(page.getByTestId("margin-pct")).toHaveText("18.4%");

  await page.getByRole("button", { name: "Record Sale" }).click();
  await expect(page.getByText(/Sale recorded: 1 from BP-OLD-01/)).toBeVisible();

  await page.goto("/yard?slot=4FT");
  const old = page.locator('[data-batch-code="BP-OLD-01"]');
  await expect(old).toContainText("Sold:9");
  await expect(old).toContainText("Available:6");
});

test("adding Jet Black x4 and Black Pearl x5 records one bill that drops both batches on the yard", async ({
  page,
  signIn,
}) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Murugan Constructions/);

  await addLine(page, JET_BLACK, "4", "173.3333");
  await addLine(page, BLACK_PEARL, "5", "206.25");

  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("order-count")).toHaveText("2 lines · 9 pieces");
  const summary = page.getByTestId("order-summary");
  await expect(summary).toContainText("₹18,650");
  await expect(page.getByTestId("total-margin")).toHaveText("₹1,800");
  await expect(summary).not.toContainText("Stickering Margin");

  await page.getByRole("button", { name: "Record Sale (2 lines)" }).click();
  await expect(page.getByText(/Sale recorded: 4 from JB-FIVE-01, 5 from BP-OLD-01/)).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record Sale" })).toBeDisabled();

  const bills = await sql<{ lines: string }>(
    `select count(*) as lines from public.sales where bill_id is not null group by bill_id`,
  );
  expect(bills.map((b) => Number(b.lines))).toEqual([2]);

  await page.goto("/yard?slot=5FT");
  await expect(page.locator('[data-batch-code="JB-FIVE-01"]')).toContainText("Available:2");
  await page.goto("/yard?slot=4FT");
  await expect(page.locator('[data-batch-code="BP-OLD-01"]')).toContainText("Available:2");
});

test("adding the same batch at the same rate twice shows one merged line", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await addLine(page, BLACK_PEARL, "2", "206.25", { batchCode: "BP-OLD-01" });
  await addLine(page, BLACK_PEARL, "1", "206.25", { batchCode: "BP-OLD-01" });
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-line")).toContainText("3 × 8 sq ft × ₹206.25/sq ft = ₹4,950");
  await expect(page.getByTestId("order-count")).toHaveText("1 line · 3 pieces");
});

test("pieces already in the order are taken off every available figure and cannot be sold twice", async ({
  page,
  signIn,
}) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await addLine(page, JET_BLACK, "4", "173.3333");

  await page.getByRole("combobox", { name: "Product" }).click();
  await expect(page.getByRole("option", { name: JET_BLACK })).toContainText("2 available in 1 batch");
  await page.getByRole("option", { name: JET_BLACK }).click();
  await expect(page.getByTestId("fifo-batch")).toContainText("2 available");
  await expect(page.getByText("2 available", { exact: true })).toBeVisible();

  await page.getByLabel("Quantity Sold").fill("3");
  await page.getByLabel("Stone Sale Price (₹)").fill("173.3333");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByText("Only 2 in stock")).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);

  await page.getByRole("button", { name: "Remove Jet Black JB-FIVE-01" }).click();
  await expect(page.getByTestId("fifo-batch")).toContainText("6 available");
});

test("while Record Sale is pending the order cannot be added to or trimmed", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);
  await addLine(page, BLACK_PEARL, "2", "206.25");
  await addLine(page, JET_BLACK, "1", "173.3333");

  await page.route(
    (url) => url.pathname === "/sell",
    async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    },
  );
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await expect(page.getByRole("button", { name: "Add to order" })).toBeEnabled();

  await page.getByRole("button", { name: "Record Sale (2 lines)" }).click();
  await expect(page.getByRole("button", { name: "Recording..." })).toBeDisabled();
  expect(await page.getByRole("button", { name: "Add to order" }).isDisabled()).toBe(true);
  const removes = await page.getByRole("button", { name: /^Remove / }).all();
  expect(removes).toHaveLength(2);
  for (const remove of removes) expect(await remove.isDisabled()).toBe(true);

  await expect(page.getByText(/Sale recorded: 2 from BP-OLD-01, 1 from JB-FIVE-01/)).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
  const sold = await sql<{ n: string }>(`select count(*) as n from public.sales`);
  expect(Number(sold[0]?.n)).toBe(2);
});

test("a refused order keeps its lines in the cart and shows the message", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);
  await addLine(page, BLACK_PEARL, "2", "206.25");
  await addLine(page, JET_BLACK, "1", "173.3333");
  await sql(`update public.batches set units_sold = initial_units where batch_code = 'JB-FIVE-01'`);

  await page.getByRole("button", { name: "Record Sale (2 lines)" }).click();
  await expect(page.getByText(/Only 0 available in batch JB-FIVE-01/)).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  const sold = await sql<{ n: string }>(`select count(*) as n from public.sales`);
  expect(Number(sold[0]?.n)).toBe(0);
});

test("choosing a stock line selects its oldest batch and enables Record Sale", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");

  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Walk-in Customer/ }).click();
  await expect(page.getByRole("button", { name: "Add to order" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(fifo.nth(0)).toContainText("BP-OLD-01");
  await expect(page.getByRole("button", { name: "Add to order" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Record Sale" })).toBeDisabled();
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByRole("button", { name: "Record Sale" })).toBeEnabled();
});

test("switching stock lines moves the default to the new line's oldest batch", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
  await expect(page.getByTestId("fifo-batch").nth(0)).toHaveAttribute("aria-checked", "true");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByPlaceholder("Product or size...").fill("Jet Black");
  await page.getByRole("option", { name: /Jet Black · 5×3 ft, 20mm/ }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo).toHaveCount(1);
  await expect(fifo.first()).toHaveAttribute("aria-checked", "true");
  await expect(fifo.first()).toContainText("JB-FIVE-01");
});

test("the default batch skips one the order has already used up", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await addLine(page, BLACK_PEARL, "7", "206.25", { batchCode: "BP-OLD-01" });
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo.nth(0)).toContainText("0 available");
  await expect(fifo.nth(0)).toHaveAttribute("aria-checked", "false");
  await expect(fifo.nth(1)).toContainText("BP-NEW-01");
  await expect(fifo.nth(1)).toHaveAttribute("aria-checked", "true");
});

test("a deep-linked batch remains selected over the FIFO default", async ({ page, signIn }) => {
  const rows = await sql<{ id: string }>(`select id from public.batches where batch_code = 'BP-NEW-01'`);
  const newBatchId = rows[0]?.id;
  if (!newBatchId) throw new Error("seed batch BP-NEW-01 was not found");
  await signIn("operator");
  await page.goto(`/sell?batch=${newBatchId}`);

  const fifo = page.getByTestId("fifo-batch");
  await expect(fifo.nth(0)).toContainText("BP-OLD-01");
  await expect(fifo.nth(1)).toContainText("BP-NEW-01");
  await expect(fifo.nth(0)).toHaveAttribute("aria-checked", "false");
  await expect(fifo.nth(1)).toHaveAttribute("aria-checked", "true");
});

test("selling more than the stock line holds is refused when adding to the order", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Walk-in Customer/ }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Jet Black · 5×3 ft/ }).click();
  await page.getByTestId("fifo-batch").first().click();
  await page.getByLabel("Quantity Sold").fill("7");
  await page.getByLabel("Stone Sale Price (₹)").fill("173.3333");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByText("Only 6 in stock")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
});

test("a punctuated phone opens a phone draft and saves the normalised value", async ({ page, signIn }) => {
  await sql(`delete from public.customers where name = 'Murugan Constructions'`);
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("+91-98765-43210");
  await page.getByRole("option", { name: 'Add customer "+91-98765-43210"' }).click();

  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Phone")).toHaveValue("+919876543210");
  await page.getByLabel("Name").fill("Punctuated Customer");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByLabel("Contact Number")).toHaveValue("+919876543210");
});

test("phone search returns only the customer whose number contains the typed digits", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("98765");

  await expect(page.getByRole("option", { name: /Murugan Constructions/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Priya Engineering/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: 'Add customer "98765"' })).toBeVisible();
});

test("the Add customer row appears for a genuinely new query", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("Brand New Customer");

  await expect(page.getByRole("option", { name: 'Add customer "Brand New Customer"' })).toBeVisible();
});

test("the Add customer row is hidden when the typed digits belong to a customer", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("919876543210");

  await expect(page.getByRole("option", { name: /Add customer/ })).toHaveCount(0);
});

test("a refusal clears as soon as the quantity is fixed", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Walk-in Customer/ }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft/ }).click();
  await page.getByTestId("fifo-batch").first().click();
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");

  await page.getByLabel("Quantity Sold").fill("99");
  await page.getByRole("button", { name: "Add to order" }).click();
  const refusal = page.getByText("Only 14 in stock");
  await expect(refusal).toBeVisible();

  await page.getByLabel("Quantity Sold").fill("1");
  await expect(refusal).toHaveCount(0);
});

test("the Add button opens a blank customer dialog and selects the saved customer", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("button", { name: "Add new customer" }).click();
  await expect(page.getByRole("dialog", { name: "New customer" })).toBeVisible();
  await page.getByLabel("Name").fill("Button Customer");
  await page.getByLabel("Phone").fill("9123456780");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("combobox", { name: "Customer" })).toHaveText("Button Customer");
  await expect(page.getByLabel("Contact Number")).toHaveValue("9123456780");
});

test("a sized line shows its Area in the picker and in the order, and a Memorial line shows none", async ({
  page,
  signIn,
}) => {
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();
  await page.getByLabel("Quantity Sold").fill("5");
  const pickerCard = page.getByTestId("area-card");
  await expect(pickerCard).toHaveCount(1);
  await expect(pickerCard).toContainText("40 sq ft");
  await expect(pickerCard).toContainText("8 per piece");

  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
  const line = page.getByTestId("cart-line");
  await expect(line.getByTestId("area-card")).toContainText("40 sq ft");
  await expect(line.getByTestId("area-card")).toContainText("8 per piece");

  await addLine(page, DOOM_STONE, "2", "1500");
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("cart-line").nth(1)).toContainText("DS-CROSS-01");
  await expect(page.getByTestId("cart-line").nth(1).getByTestId("area-card")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: DOOM_STONE }).click();
  await expect(page.getByTestId("area-card")).toHaveCount(1);
});

test("the stone price is typed per sq ft for sized stone and per piece for a Memorial, and the order totals it", async ({
  page,
  signIn,
}) => {
  await sql(
    `update public.batches set initial_units = 20, units_sold = 0 where batch_code in ('BP-OLD-01', 'DS-CROSS-01')`,
  );
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Murugan Constructions/);

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();
  await expect(page.getByText("Per sq ft", { exact: true })).toBeVisible();
  await page.getByTestId("fifo-batch").filter({ hasText: "BP-OLD-01" }).click();
  await page.getByLabel("Quantity Sold").fill("10");
  await page.getByLabel("Stone Sale Price (₹)").fill("250");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByTestId("cart-line")).toContainText("10 × 8 sq ft × ₹250/sq ft = ₹20,000");
  await expect(page.getByTestId("order-summary")).toContainText("Stone Sale Price₹20,000");

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: DOOM_STONE }).click();
  await expect(page.getByText("Per piece", { exact: true })).toBeVisible();
  await page.getByLabel("Quantity Sold").fill("10");
  await page.getByLabel("Stone Sale Price (₹)").fill("2000");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByTestId("cart-line").nth(1)).toContainText("10 × ₹2,000 = ₹20,000");
  await expect(page.getByTestId("order-summary")).toContainText("Stone Sale Price₹40,000");

  await page.getByRole("button", { name: "Record Sale (2 lines)" }).click();
  await expect(page.getByText(/Sale recorded/)).toBeVisible();
  const stored = await sql<{ batch_code: string; sale_rate: string; area_sqft: string | null }>(
    `select b.batch_code, s.sale_rate, s.area_sqft from public.sales s join public.batches b on b.id = s.batch_id order by b.batch_code`,
  );
  expect(
    stored.map((r) => [r.batch_code, Number(r.sale_rate), r.area_sqft === null ? null : Number(r.area_sqft)]),
  ).toEqual([
    ["BP-OLD-01", 250, 8],
    ["DS-CROSS-01", 2000, null],
  ]);
});

async function seedSplitStock() {
  await sql(`update public.batches set initial_units = 14, units_sold = 0 where batch_code = 'BP-OLD-01'`);
  await sql(`update public.batches set initial_units = 30, units_sold = 0 where batch_code = 'BP-NEW-01'`);
}

async function askForBlackPearl(page: Page, quantity: string, options: { batchCode?: string; price?: string } = {}) {
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();
  if (options.batchCode) {
    await page.getByTestId("fifo-batch").filter({ hasText: options.batchCode }).click();
  }
  await page.getByLabel("Quantity Sold").fill(quantity);
  await page.getByLabel("Stone Sale Price (₹)").fill(options.price ?? "206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
}

test("asking for more than the selected batch holds splits the quantity across batches in a modal", async ({
  page,
  signIn,
}) => {
  await seedSplitStock();
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: BLACK_PEARL }).click();
  await page.getByLabel("Quantity Sold").fill("20");
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("switch", { name: "Add Stickering / Engraving Service" }).click();
  await page.getByLabel("Stickering Cost (₹)").fill("100");
  await page.getByLabel("Stickering Price (₹)").fill("250");
  await page.getByRole("button", { name: "Add to order" }).click();

  const dialog = page.getByRole("dialog", { name: "Split 20 pieces across batches" });
  await expect(dialog).toBeVisible();
  const rows = dialog.getByTestId("split-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("BP-OLD-01");
  await expect(rows.nth(0)).toContainText("14 available");
  await expect(rows.nth(1)).toContainText("BP-NEW-01");
  await expect(rows.nth(1)).toContainText("30 available");
  const oldCount = dialog.getByLabel("Take from BP-OLD-01");
  const newCount = dialog.getByLabel("Take from BP-NEW-01");
  await expect(oldCount).toHaveValue("14");
  await expect(newCount).toHaveValue("6");
  const total = dialog.getByTestId("split-total");
  const add = dialog.getByRole("button", { name: "Add", exact: true });
  await expect(total).toHaveText("20 of 20");
  await expect(add).toBeEnabled();
  await expect(add).toHaveCSS("opacity", "1");

  await newCount.fill("5");
  await expect(total).toHaveText("19 of 20");
  await expect(add).toBeDisabled();
  await expect(add).toHaveCSS("opacity", "0.5");

  await newCount.fill("6");
  await expect(add).toBeEnabled();
  await expect(add).toHaveCSS("opacity", "1");
  await add.click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  const lines = page.getByTestId("cart-line");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText("BP-OLD-01 · 14 × 8 sq ft × ₹206.25/sq ft = ₹23,100 + ₹250 stickering");
  await expect(lines.nth(1)).toContainText("BP-NEW-01 · 6 × 8 sq ft × ₹206.25/sq ft = ₹9,900 + ₹250 stickering");
  await expect(page.getByTestId("order-count")).toHaveText("2 lines · 20 pieces");
  const product = page.getByRole("combobox", { name: "Product" });
  await expect.poll(() => product.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("a quantity the selected batch covers adds with no modal", async ({ page, signIn }) => {
  await seedSplitStock();
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await askForBlackPearl(page, "14");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-line")).toContainText("BP-OLD-01 · 14 × 8 sq ft × ₹206.25/sq ft = ₹23,100");
});

test("pieces already in the order count against the split and a request beyond all stock is refused", async ({
  page,
  signIn,
}) => {
  await seedSplitStock();
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await askForBlackPearl(page, "14", { batchCode: "BP-OLD-01" });
  await expect(page.getByTestId("cart-line")).toHaveCount(1);

  await askForBlackPearl(page, "1", { batchCode: "BP-OLD-01" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("split-row")).toHaveCount(2);
  await expect(dialog.getByTestId("split-row").nth(0)).toContainText("0 available");
  await expect(dialog.getByTestId("split-total")).toHaveText("1 of 1");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("cart-line").nth(1)).toContainText("BP-NEW-01 · 1 × 8 sq ft × ₹206.25/sq ft = ₹1,650");

  await askForBlackPearl(page, "30");
  await expect(page.getByText("Only 29 in stock")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
});

test("closing the split modal adds nothing and returns focus to Add to order", async ({ page, signIn }) => {
  await seedSplitStock();
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await askForBlackPearl(page, "20");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Add to order" });
  await expect.poll(() => trigger.evaluate((element) => document.activeElement === element)).toBe(true);
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
  await expect(page.getByLabel("Quantity Sold")).toHaveValue("20");
});

test("the split modal lists only the batches that still have stock", async ({ page, signIn }) => {
  await seedSplitStock();
  await sql(`update public.batches set units_sold = initial_units where batch_code = 'BP-OLD-01'`);
  await sql(`insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft,
      thickness_mm, slot, stack_number, initial_units, units_sold, unit_purchase_price, freight_cost)
    select 'BP-MID-01', variant_id, supplier_id, purchase_date - 40, length_ft, breadth_ft, thickness_mm, slot,
      stack_number, 5, 0, unit_purchase_price, freight_cost from public.batches where batch_code = 'BP-NEW-01'`);
  await signIn("operator");
  await page.goto("/sell");
  await chooseCustomer(page, /Walk-in Customer/);

  await askForBlackPearl(page, "33");
  const rows = page.getByRole("dialog").getByTestId("split-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("BP-MID-01");
  await expect(rows.nth(1)).toContainText("BP-NEW-01");
});
