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
    select current_date, b.id, c.id, 3, 1650, 1450, 'CASH' from public.batches b, public.customers c
    where b.batch_code = 'BP-NEW-01' and c.is_walk_in`);
  await sql(`update public.batches set units_sold = units_sold + 3 where batch_code = 'BP-NEW-01'`);
});

test("overview shows KPIs, donut, fast moving bars and the stale panel linking to the yard", async ({ page, signIn }) => {
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
