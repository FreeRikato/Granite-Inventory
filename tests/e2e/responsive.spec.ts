import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";
import type { Locator, Page } from "@playwright/test";

async function measure(
  locator: Locator,
): Promise<{ readonly width: number; readonly clientWidth: number; readonly scrollWidth: number }> {
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
  await sql(
    `insert into public.team_members (email, name, role) values ('meena@test.local', 'Meena Kumar', 'YARD_OPERATOR')`,
  );

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
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`,
  );
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

test("mobile inward and sell fit a 375px screen with seeded rows", async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, "responsive behavior is covered by the mobile project");
  await resetDomainData();
  await seedYard();
  await sql(
    `insert into public.customers (name, phone, customer_type) values
      ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR'),
      ('${"Subramaniam".repeat(7)}', '+91 98765 43211', 'TRUST'),
      ('Customer ${"Long Name ".repeat(8)}', null, 'REGULAR')`,
  );
  await sql(`update public.suppliers set name = '${"Madurai Quarry ".repeat(6)}' where name = 'Madurai Quarry'`);
  await sql(`update public.products set name = '${"Black Pearl ".repeat(6)}' where abbreviation = 'BP'`);
  await page.setViewportSize({ width: 375, height: 812 });

  await signIn("admin");

  await page.goto("/inward");
  await expect(page.locator("#supplier")).toBeVisible();
  await page.locator("#supplier").click();
  await page.getByRole("option").first().click();
  await page.locator("#product").click();
  await page.getByRole("option").first().click();
  await expectNoHorizontalPageScroll(page);
  const addButtons = page.getByRole("button", { name: /^Add new / });
  await expect(addButtons).toHaveCount(3);
  for (const button of await addButtons.all()) await expectReachableOnMobile(page, button);

  await page.goto("/sell");
  await expect(page.locator("#customer")).toBeVisible();
  await page.locator("#customer").click();
  await page.getByRole("option", { name: /Subramaniam/ }).click();
  await page.locator("#line").click();
  await page
    .getByRole("option", { name: /Black Pearl/ })
    .first()
    .click();
  await expect(page.getByTestId("fifo-batch").first()).toBeVisible();
  await expectNoHorizontalPageScroll(page);
});

test("mobile customers list fits a 375px screen with a thousand stress-like customers", async ({
  page,
  signIn,
  isMobile,
}) => {
  test.skip(!isMobile, "responsive behavior is covered by the mobile project");
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.customers (name, phone, customer_type)
    select case n % 5
        when 0 then 'Customer ' || repeat('Subramaniam', 7) || n
        when 1 then 'Sri Venkateswara Rajeswari Constructions & Granite Traders Pvt Ltd ' || n
        when 2 then repeat('W', 60) || n
        when 3 then 'Murugan ' || n
        else repeat('Long Name ', 8) || n end,
      case when n % 3 = 0 then null else '+91 98765 ' || lpad(n::text, 10, '0') end,
      (array['REGULAR', 'CONTRACTOR', 'ENGINEER', 'TRUST', 'RETAIL'])[1 + n % 5]
    from generate_series(1, 1000) n`);
  await sql(`update public.batches set initial_units = 5000 where batch_code = 'BP-OLD-01'`);
  await sql(`insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, payment_mode)
    select private.ist_today() - (row_number() over ())::int % 30, b.id, c.id, 1, 1650, 1450, 'CASH'
    from public.batches b, (select id from public.customers limit 400) c where b.batch_code = 'BP-OLD-01'`);
  await sql(`update public.batches set units_sold = units_sold + 400 where batch_code = 'BP-OLD-01'`);
  await page.setViewportSize({ width: 375, height: 812 });

  await signIn("admin");
  await page.goto("/customers");
  await expect(page.getByTestId("customer-row")).toHaveCount(1000);
  await expectNoHorizontalPageScroll(page);
});
