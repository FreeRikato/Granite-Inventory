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

test("yard shows batches per slot with ageing, a clamp, and filters", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/yard");
  await expect(page.getByRole("heading", { name: "Yard Slots" })).toBeVisible();

  const cards = page.getByTestId("yard-batch");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-batch-code", "BP-OLD-01");
  await expect(cards.nth(0)).toContainText(/Stale stock · 232 days in the yard/i);
  await expect(cards.nth(1)).toContainText("New stock");
  await expect(page.getByTestId("clamp")).toContainText("New batch arrived 229 days later");

  await page.getByRole("tab", { name: /Doom Stones/ }).click();
  await expect(page.getByTestId("yard-batch")).toHaveCount(1);
  await expect(page.getByTestId("yard-batch")).toContainText("Fixed size");

  await page.goto("/yard?slot=4FT&age=180");
  await expect(page.getByTestId("yard-batch")).toHaveCount(1);
  await expect(page.getByTestId("yard-batch")).toHaveAttribute("data-batch-code", "BP-OLD-01");

  await page.goto("/yard?slot=4FT&sort=newest");
  await expect(page.getByTestId("yard-batch").first()).toHaveAttribute("data-batch-code", "BP-NEW-01");
});

test("showing sold-out batches exposes a Sold out marker", async ({ page, signIn }) => {
  await sql(`update public.batches set units_sold = initial_units where batch_code = 'JB-FIVE-01'`);
  await signIn("operator");
  await page.goto("/yard?slot=5FT");

  await page.getByRole("switch", { name: "Show sold out" }).click();
  const card = page.getByTestId("yard-batch").filter({ hasText: "JB-FIVE-01" });
  await expect(card.getByText("Sold out", { exact: true })).toBeVisible();
});

test("yard filter controls keep product, variant, thickness, supplier, age band, and sort wired", async ({ page, signIn }) => {
  await signIn("operator");
  const cards = page.getByTestId("yard-batch");

  await page.goto("/yard?slot=5FT");
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: "Jet Black", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("data-batch-code", "JB-FIVE-01");

  await page.goto("/yard?slot=5FT");
  await page.getByRole("combobox", { name: "Variant" }).click();
  await page.getByRole("option", { name: "Premium", exact: true }).click();
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
