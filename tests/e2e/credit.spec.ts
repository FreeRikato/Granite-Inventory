import { expect, openDialog, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '9843012345', 'CONTRACTOR')`,
  );
});

test("a Bill sold on credit is paid off with a mixed payment and leaves the open list", async ({ page, signIn }) => {
  await signIn("operator");

  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Murugan Constructions/ }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
  await page.getByLabel("Quantity Sold").fill("4");
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByTestId("customer-pays")).toHaveText("₹6,600");

  await page.getByRole("switch", { name: /Part payment/ }).click();
  await page.getByRole("spinbutton", { name: /Cash/ }).fill("2000");
  const tile = page.getByTestId("credit-tile");
  await expect(tile.getByTestId("credit-balance")).toHaveText("₹4,600");
  await page.getByRole("button", { name: "Record Sale" }).click();
  await expect(page.getByText(/Sale recorded/)).toBeVisible();

  await page.goto("/credit");
  const card = page.getByTestId("credit-card").filter({ hasText: "Murugan Constructions" });
  await expect(card.getByTestId("credit-balance")).toHaveText("₹4,600");
  await expect(card.getByTestId("due-badge")).toBeVisible();

  await openDialog(page, card.getByRole("button", { name: "Record payment" }));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "UPI" }).click();
  await dialog.getByRole("spinbutton", { name: /Cash/ }).fill("1000");
  await expect(dialog.getByRole("textbox", { name: /UPI/ })).toHaveValue("₹3,600");
  await dialog.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByText(/Payment of ₹4,600 recorded/)).toBeVisible();
  await expect(page.getByTestId("credit-card")).toHaveCount(0);

  await page.getByRole("radio", { name: "Paid" }).click();
  const settled = page.getByTestId("credit-card").filter({ hasText: "Murugan Constructions" });
  await expect(settled).toContainText("Paid in full");
  await settled.getByRole("button", { name: "Payments" }).click();
  await expect(settled.getByTestId("credit-receipt")).toContainText("Cash ₹1,000 + UPI ₹3,600");
});
