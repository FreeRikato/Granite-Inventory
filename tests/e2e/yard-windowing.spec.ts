import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await sql(`insert into public.suppliers (name) values ('Windowing Quarry') on conflict do nothing`);
  await sql(`insert into public.products (name, abbreviation, category) values ('Windowing Pearl', 'WP', 'GRANITE')`);
  await sql(
    `insert into public.variants (product_id, name) select id, 'Grade 1' from public.products where name = 'Windowing Pearl'`,
  );
  await sql(`
    insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, stack_number, initial_units, units_sold, unit_purchase_price, freight_cost)
    select 'WIN-' || g, v.id, s.id, private.ist_today() - (g % 300), 4, 2, 16, '4FT', ((g % 6) + 1)::text, 10, 0, 1400, 0
    from generate_series(1, 1200) g, public.variants v join public.products p on p.id = v.product_id, public.suppliers s
    where p.name = 'Windowing Pearl' and s.name = 'Windowing Quarry'`);
});

test("the yard mounts only the cards near the viewport", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/yard");
  await expect(page.getByTestId("yard-batch").first()).toBeVisible();

  const nodes = await page.evaluate(() => document.querySelectorAll("*").length);
  expect(nodes).toBeLessThan(5000);
  expect(await page.getByTestId("yard-batch").count()).toBeLessThan(100);

  const labelled = await page.locator('[data-testid="yard-stack"][aria-label]').count();
  expect(labelled).toBe(await page.getByTestId("yard-stack").getByRole("heading", { level: 2 }).count());
});
