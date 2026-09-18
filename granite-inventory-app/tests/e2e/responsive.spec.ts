import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";
import type { Locator, Page } from "@playwright/test";

async function measure(locator: Locator): Promise<{ readonly width: number; readonly clientWidth: number; readonly scrollWidth: number }> {
  return locator.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
}

async function expectReachableOnMobile(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
}

async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.beforeAll(async () => {
  await ensureTestUsers();
});

test("mobile Team & access rows keep identity and controls usable", async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, "responsive behavior is covered by the mobile project");
  await resetDomainData();
  await sql(`delete from public.team_members where email = 'meena@test.local'`);
  await sql(`insert into public.team_members (email, name, role) values ('meena@test.local', 'Meena Kumar', 'YARD_OPERATOR')`);

  await signIn("admin");
  await page.goto("/settings");

  const row = page.getByTestId("member-row").filter({ hasText: "Meena Kumar" });
  const name = row.getByText("Meena Kumar", { exact: true });
  const email = row.getByText("meena@test.local", { exact: true });
  await expect(name).toBeVisible();
  await expect(email).toBeVisible();

  for (const identityLine of [name, email]) {
    const dimensions = await measure(identityLine);
    expect(dimensions.width).toBeGreaterThanOrEqual(120);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }

  const role = row.getByRole("combobox", { name: "Role for meena@test.local" });
  const remove = row.getByRole("button", { name: "Remove", exact: true });
  await expect(role).toBeEnabled();
  await expect(remove).toBeEnabled();

  await role.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await remove.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expectNoHorizontalPageScroll(page);
});

test("mobile customer sales reflow keeps margin and admin actions reachable", async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, "responsive behavior is covered by the mobile project");
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`);
  await sql(`insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
    select private.ist_today() - 3, b.id, c.id, 2, 1650, 1450, 'CASH' from public.batches b, public.customers c
    where b.batch_code = 'BP-OLD-01' and c.name = 'Murugan Constructions'`);
  await sql(`update public.batches set units_sold = units_sold + 2 where batch_code = 'BP-OLD-01'`);

  await signIn("admin");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan Constructions" }).click();

  const row = page.getByTestId("sale-row");
  const margin = row.getByText(/₹400/);
  const edit = row.getByRole("button", { name: "Edit sale of BP-OLD-01" });
  const remove = row.getByRole("button", { name: "Delete", exact: true });
  await expect(margin).toBeVisible();
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  await expectReachableOnMobile(page, margin);
  await expectReachableOnMobile(page, edit);
  await expectReachableOnMobile(page, remove);
  await expectNoHorizontalPageScroll(page);
});
