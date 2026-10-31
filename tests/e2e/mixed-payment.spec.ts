import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
});

test("a Bill paid Cash + UPI on Sell shows on both rows of the Margin table", async ({ page, signIn }) => {
  await signIn("operator");
  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Walk-in Customer/ }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
  await page.getByLabel("Quantity Sold").fill("4");
  await page.getByLabel("Stone Sale Price (₹)").fill("206.25");
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByTestId("customer-pays")).toHaveText("₹6,600");

  const modes = page.getByRole("group", { name: "Payment Mode" });
  await modes.getByRole("button", { name: "UPI" }).click();
  await expect(modes.getByRole("button", { name: "Cash" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("spinbutton", { name: "Cash" }).fill("4000");
  await expect(page.getByRole("textbox", { name: /UPI/ })).toHaveValue("₹2,600");
  await page.getByRole("button", { name: "Record Sale" }).click();
  await expect(page.getByText(/Sale recorded/)).toBeVisible();

  await page.goto("/");
  const card = page.getByTestId("margin-card");
  await card.getByRole("radio", { name: "Table" }).click();
  await expect(card.getByRole("radio", { name: "Week" })).toHaveAttribute("aria-checked", "true");
  const rows = card.getByTestId("payment-row");
  await expect(rows.filter({ hasText: "Cash" })).toContainText("₹4,000");
  await expect(rows.filter({ hasText: "UPI" })).toContainText("₹2,600");
  await expect(card.getByTestId("payment-total")).toContainText("₹6,600");
});
