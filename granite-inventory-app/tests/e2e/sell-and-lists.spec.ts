import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(`insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`);
});

test("collision selection leaves one customer option and no duplicate key warning", async ({ page, signIn }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));

  await signIn("operator");
  await page.goto("/sell");

  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("9876543210");
  await page.getByRole("option", { name: 'Add customer "9876543210"' }).click();
  await page.getByLabel("Name").fill("Someone Else");
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await expect(page.getByText(/already has that phone number, selected instead/)).toBeVisible();

  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByPlaceholder("Name or phone...").fill("98765");
  await expect(page.getByRole("option", { name: /Murugan Constructions/ })).toHaveCount(1);
  expect(consoleMessages.filter((message) => message.toLowerCase().includes("same key"))).toEqual([]);
});

test("mobile customer rows show the full name and move the type below it", async ({ page, signIn }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This case is scoped to the mobile project.");

  await signIn("operator");
  await page.goto("/customers");

  const row = page.getByTestId("customer-row").filter({ hasText: "Murugan Constructions" });
  const name = row.locator("span.flex.min-w-0 > span").first();
  const badge = row.getByText("Contractor", { exact: true });
  await expect(name).toHaveText("Murugan Constructions");
  await expect.poll(() => name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const nameBottom = await name.evaluate((element) => element.getBoundingClientRect().bottom);
  const badgeTop = await badge.evaluate((element) => element.getBoundingClientRect().top);
  expect(badgeTop).toBeGreaterThan(nameBottom);
});

test("catalog not-live page has a level-one heading", async ({ page }) => {
  const response = await page.goto("/catalog");
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveCount(1);
});
