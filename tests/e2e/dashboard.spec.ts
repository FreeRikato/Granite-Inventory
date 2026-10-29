import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
    select private.ist_today(), b.id, c.id, 3, 1650, 1450, 'CASH' from public.batches b, public.customers c
    where b.batch_code = 'BP-NEW-01' and c.is_walk_in`);
  await sql(`update public.batches set units_sold = units_sold + 3 where batch_code = 'BP-NEW-01'`);
});

test("overview shows KPIs, donut, fast moving bars and the stale panel linking to the yard", async ({
  page,
  signIn,
}) => {
  await signIn("admin");
  await page.goto("/");
  await expect(page.getByTestId("kpi-active")).toHaveText("26");
  await expect(page.getByTestId("kpi-value")).toHaveText("₹38,650");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("₹4,950");
  await expect(page.getByTestId("active-pct")).toHaveText("65%");
  await expect(page.getByRole("list", { name: "Units sold by size" })).toContainText("4 × 2 ft");
  await expect(page.getByTestId("stale-row")).toHaveCount(1);
  await expect(page.getByTestId("stale-row")).toContainText("BP-OLD-01");
  await page.getByTestId("stale-row").click();
  await expect(page).toHaveURL(/\/yard\?line=.*&q=BP-OLD-01/);
  await expect(page.getByTestId("yard-batch")).toHaveCount(1);
});

test("margin card shows 12 weekly bars and switches to 12 monthly bars", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/");
  const card = page.getByTestId("margin-card");
  const bars = card.getByTestId("margin-bar");
  await expect(card.getByRole("radio", { name: "Week" })).toHaveAttribute("aria-checked", "true");
  await expect(bars).toHaveCount(12);
  await expect(bars.last()).toHaveAttribute("data-current", "true");
  await expect(bars.first()).toHaveAttribute("data-current", "false");

  await card.getByRole("radio", { name: "Month" }).click();
  await expect(card.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
  await expect(card.getByRole("group", { name: "Margin by month" })).toBeVisible();
  await expect(bars).toHaveCount(12);
});

async function seedBuyers(): Promise<{ murugan: string }> {
  await sql(`insert into public.products (name, abbreviation, category) values ('Red Rock', 'RR', 'GRANITE')`);
  await sql(
    `insert into public.variants (product_id, name) select id, 'Grade 1' from public.products where name = 'Red Rock'`,
  );
  await sql(`insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, stack_number, initial_units, units_sold, unit_purchase_price, freight_cost)
    select 'RR-01', v.id, s.id, private.ist_today() - 200, 4, 2, 16, '4FT', '9', 20, 2, 1000, 0
    from public.variants v join public.products p on p.id = v.product_id, public.suppliers s where p.name = 'Red Rock' and s.name = 'Madurai Quarry'`);
  const [{ id: murugan }] = await sql<{ id: string }>(
    `insert into public.customers (name) values ('Murugan') returning id`,
  );
  await sql(`insert into public.customers (name) values ('Old Buyer')`);
  const sale = (customer: string, batch: string, quantity: number, price: number, daysAgo: number) =>
    sql(
      `insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
       select private.ist_today() - $4::integer, b.id, c.id, $3, $5, 1000, 'CASH'
       from public.batches b, public.customers c where b.batch_code = $1 and c.name = $2`,
      [batch, customer, quantity, daysAgo, price],
    );
  await sale("Murugan", "BP-NEW-01", 20, 1650, 0);
  await sale("Murugan", "JB-FIVE-01", 10, 2000, 0);
  await sale("Murugan", "DS-CROSS-01", 6, 1000, 0);
  await sale("Murugan", "RR-01", 2, 1000, 0);
  await sale("Old Buyer", "BP-OLD-01", 4, 3000, 120);
  return { murugan };
}

test("top customers ranks the last 90 days, switches to all time, and links to the customer", async ({
  page,
  signIn,
}) => {
  const { murugan } = await seedBuyers();
  await signIn("admin");
  await page.goto("/");
  const card = page.getByTestId("top-customers-card");
  await expect(card.getByRole("radio", { name: "Last 90 days" })).toHaveAttribute("aria-checked", "true");

  const rows = card.getByTestId("top-customer-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByTestId("top-customer-billed")).toHaveText("₹61,000");
  await expect(rows.first().getByTestId("top-customer-products")).toHaveText(
    "Black Pearl 20 pcs · Jet Black 10 pcs · Doom Stone 6 pcs · +1 more",
  );
  const products = rows.first().getByTestId("top-customer-products");
  await expect(products).toContainText("+1 more");
  const clipped = await products.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);
  const overflowsPage = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowsPage).toBe(false);
  await expect(rows.first().getByTestId("top-customer-link")).toHaveAttribute("href", `/customers/${murugan}`);
  await expect(card).not.toContainText("Old Buyer");

  await card.getByRole("radio", { name: "All time" }).click();
  await expect(rows).toHaveCount(3);
  await expect(card).toContainText("Old Buyer");
  await expect(rows.nth(1).getByTestId("top-customer-products")).toHaveText("Black Pearl 4 pcs");

  await card.getByRole("radio", { name: "This month" }).click();
  await expect(card.getByRole("radio", { name: "This month" })).toHaveAttribute("aria-checked", "true");
  await expect(rows.first()).toContainText("Murugan");

  await rows.first().getByTestId("top-customer-link").click();
  await expect(page).toHaveURL(new RegExp(`/customers/${murugan}$`));
});

test("switching the margin period keeps the previous chart until the new rows arrive", async ({ page, signIn }) => {
  let release: () => void = () => {};
  const monthHeld = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/rpc/margin_by_period", async (route) => {
    if (route.request().postDataJSON()?.p_grain === "month") await monthHeld;
    await route.continue();
  });

  await signIn("admin");
  await page.goto("/");
  const card = page.getByTestId("margin-card");
  const bars = card.getByTestId("margin-bar");
  await expect(bars).toHaveCount(12);

  await card.getByRole("radio", { name: "Month" }).click();
  await expect(card.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
  await expect(card.getByRole("group", { name: "Margin by week" })).toBeVisible();
  await expect(bars).toHaveCount(12);
  await expect(card.locator(".animate-pulse")).toHaveCount(0);

  release();
  await expect(card.getByRole("group", { name: "Margin by month" })).toBeVisible();
  await expect(bars).toHaveCount(12);
  await expect(card.locator(".animate-pulse")).toHaveCount(0);
});

test("switching the top customers window keeps the previous list until the new rows arrive", async ({
  page,
  signIn,
}) => {
  let release: () => void = () => {};
  const allHeld = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/rpc/top_customers", async (route) => {
    if (route.request().postDataJSON()?.p_window === "all") await allHeld;
    await route.continue();
  });

  await signIn("admin");
  await page.goto("/");
  const card = page.getByTestId("top-customers-card");
  const rows = card.getByTestId("top-customer-row");
  await expect(rows).toHaveCount(1);

  await card.getByRole("radio", { name: "All time" }).click();
  await expect(card.getByRole("radio", { name: "All time" })).toHaveAttribute("aria-checked", "true");
  await expect(rows).toHaveCount(1);
  await expect(card.locator(".animate-pulse")).toHaveCount(0);

  release();
  await expect(card.locator(".animate-pulse")).toHaveCount(0);
  await expect(rows).toHaveCount(1);
});
