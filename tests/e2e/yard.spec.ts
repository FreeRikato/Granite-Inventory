import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("yard groups purchases by yard slot and batch number, with ageing, a clamp and filters", async ({
  page,
  signIn,
}) => {
  await signIn("operator");
  await page.goto("/yard");
  await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();

  const stacks = page.getByTestId("yard-stack");
  await expect(stacks.getByRole("heading", { level: 2 })).toHaveText([
    "4 ft Slot · 12",
    "5 ft Slot · 3",
    "No batch number",
  ]);
  await expect(stacks.nth(0)).toContainText("2 purchases · 14 available");

  const cards = stacks.nth(0).getByTestId("yard-batch");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-batch-code", "BP-OLD-01");
  await expect(cards.nth(0)).toContainText(/Stale stock · 232 days in the yard/i);
  await expect(cards.nth(1)).toContainText("New stock");
  await expect(stacks.nth(0).getByTestId("clamp")).toContainText("New batch arrived 229 days later");

  await page.getByRole("combobox", { name: "Slot" }).click();
  await page.getByRole("option", { name: "Doom Stones", exact: true }).click();
  await expect(stacks.getByRole("heading", { level: 2 })).toHaveText(["No batch number"]);
  await expect(page.getByTestId("yard-batch")).toContainText("Fixed size");

  await page.goto("/yard?slot=4FT&age=180");
  await expect(page.getByTestId("yard-batch")).toHaveCount(1);
  await expect(page.getByTestId("yard-batch")).toHaveAttribute("data-batch-code", "BP-OLD-01");

  await page.goto("/yard?slot=4FT&sort=newest");
  await expect(page.getByTestId("yard-batch").first()).toHaveAttribute("data-batch-code", "BP-NEW-01");

  await page.goto("/yard?q=12");
  await expect(stacks.getByRole("heading", { level: 2 })).toHaveText(["4 ft Slot · 12"]);
});

test("showing sold-out batches exposes a Sold out marker", async ({ page, signIn }) => {
  await sql(`update public.batches set units_sold = initial_units where batch_code = 'JB-FIVE-01'`);
  await signIn("operator");
  await page.goto("/yard?slot=5FT");

  await page.getByRole("switch", { name: "Show sold out" }).click();
  const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
  await expect(card.getByText("Sold out", { exact: true })).toBeVisible();
});

test("yard filter controls keep product, thickness, supplier, age band, and sort wired", async ({ page, signIn }) => {
  await signIn("operator");
  const cards = page.getByTestId("yard-batch");

  await page.goto("/yard?slot=5FT");
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Jet Black", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("data-batch-code", "JB-FIVE-01");

  await page.goto("/yard?slot=5FT");
  await page.getByRole("combobox", { name: "Thickness" }).click();
  await page.getByRole("option", { name: "20mm", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("data-batch-code", "JB-FIVE-01");

  await page.goto("/yard?slot=4FT");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Madurai Quarry", exact: true }).click();
  await expect(cards).toHaveCount(2);

  await page.goto("/yard?slot=4FT");
  await page.getByRole("combobox", { name: "Age" }).click();
  await page.getByRole("option", { name: "Stale band", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("data-batch-code", "BP-OLD-01");

  await page.goto("/yard?slot=4FT&sort=newest");
  await expect(cards.first()).toHaveAttribute("data-batch-code", "BP-NEW-01");
});

test("an empty yard says so, and the filter message appears only when a filter is active", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/yard?q=nomatch");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();

  await sql(`delete from public.batches`);
  await page.goto("/yard");
  await expect(page.getByText("No batches in the yard yet. Log a delivery to get started.")).toBeVisible();
  await expect(page.getByText("Nothing matches these filters.")).toHaveCount(0);
});

test("a failed first load of the yard shows the error, not the skeleton", async ({ page, signIn }) => {
  await signIn("operator");
  await page.route("**/rest/v1/v_yard_batches*", (route) => route.fulfill({ status: 500, json: { message: "boom" } }));
  await page.goto("/yard");
  await expect(page.getByText("Could not load the yard")).toBeVisible({ timeout: 30_000 });
});

test("a stack of more than six purchases is one framed section with one heading", async ({ page, signIn }) => {
  await sql(`
    insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, stack_number, initial_units, units_sold, unit_purchase_price, freight_cost)
    select 'BIG-' || g, v.id, s.id, private.ist_today() - g, 4, 2, 16, '4FT', '99', 5, 0, 1400, 0
    from generate_series(1, 7) g, public.variants v join public.products p on p.id = v.product_id, public.suppliers s
    where p.name = 'Black Pearl' and s.name = 'Madurai Quarry'`);
  await signIn("operator");
  await page.goto("/yard?q=BIG");
  const stacks = page.getByTestId("yard-stack");
  await expect(stacks).toHaveCount(1);
  await expect(stacks.getByRole("heading", { level: 2 })).toHaveText(["4 ft Slot · 99"]);
  await expect(stacks.getByTestId("yard-batch")).toHaveCount(7);
});
