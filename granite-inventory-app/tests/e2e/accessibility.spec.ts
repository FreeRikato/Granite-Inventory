import AxeBuilder from "@axe-core/playwright";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

const THEMES = ["light", "dark"] as const;
const RULES = ["color-contrast", "heading-order", "definition-list", "landmark-unique", "empty-table-header"] as const;

const PAGES = [
  { name: "catalog", path: "/catalog" },
  { name: "overview", path: "/" },
  { name: "sell", path: "/sell" },
  { name: "yard", path: "/yard" },
  { name: "customer detail", path: "customer-detail" },
  { name: "settings", path: "/settings" },
] as const;

let customerId = "";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`update public.settings set catalog_public = true, whatsapp_number = '+91 98765 43210'`);
  await sql(`
    insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
    select private.ist_today(), b.id, c.id, 1, 1800, 1500, 'CASH'
    from public.batches b, public.customers c
    where b.batch_code = 'BP-NEW-01' and c.is_walk_in
  `);
  await sql(`update public.batches set units_sold = units_sold + 1 where batch_code = 'BP-NEW-01'`);
  const customers = await sql<{ id: string }>(`select id from public.customers where is_walk_in limit 1`);
  customerId = customers[0]?.id ?? "";
});

for (const theme of THEMES) {
  for (const target of PAGES) {
    test(`${theme} ${target.name} has no ticket accessibility violations`, async ({ page, signIn }, testInfo) => {
      await page.goto("/login");
      await page.evaluate((selectedTheme) => localStorage.setItem("theme", selectedTheme), theme);
      await signIn("admin");

      const path = target.path === "customer-detail" ? `/customers/${customerId}` : target.path;
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);

      const results = await new AxeBuilder({ page }).withRules([...RULES]).analyze();
      expect(results.violations, `${theme} ${target.name}`).toEqual([]);

      if (target.name === "settings" && testInfo.project.name === "desktop") {
        await expect(page.getByRole("link", { name: /Test Admin/ })).toHaveAttribute("aria-current", "page");
      }
      if (target.name === "sell") {
        await expect(page.getByRole("complementary", { name: "Order summary" })).toBeVisible();
      }
    });
  }
}
