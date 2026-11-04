import { expect, openDialog, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { signedInClient, sql } from "../seam/harness";
import { createCustomer, recordBill, today } from "../seam/fixtures";

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  const db = await signedInClient("operator");
  const customerId = await createCustomer(db, { name: "Murugan Constructions", phone: "9843012345" });
  const [batch] = await sql<{ id: string }>(`select id from public.batches where batch_code = 'DS-CROSS-01'`);
  const { error } = await recordBill(db, {
    customerId,
    saleDate: today(),
    payments: [{ payment_mode: "CASH", amount: 6000 }],
    onCredit: true,
    lines: [{ batchId: batch?.id ?? "", quantity: 5, saleRate: 2000 }],
  });
  if (error) throw error;
});

test("Overview shows what is still owed, agrees with Credit and moves with a Later payment", async ({
  page,
  signIn,
}) => {
  await signIn("operator");

  await page.goto("/");
  await expect(page.getByTestId("kpi-outstanding")).toHaveText("₹4,000");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("₹10,000");

  await page.goto("/credit");
  await expect(page.locator("dl").getByText("₹4,000")).toBeVisible();
  const card = page.getByTestId("credit-card").filter({ hasText: "Murugan Constructions" });
  await openDialog(page, card.getByRole("button", { name: "Record payment" }));
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton", { name: "Amount (₹)" })).toHaveValue("4000");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Payment of ₹4,000 recorded/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("kpi-outstanding")).toHaveText("₹0");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("₹10,000");
});

test("a failed Credit read leaves the rest of Overview on screen", async ({ page, signIn }) => {
  await page.route("**/rest/v1/v_credit*", (route) => route.abort());
  await signIn("operator");

  await page.goto("/");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("₹10,000");
  await expect(page.getByText("Could not load", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("kpi-outstanding")).toHaveCount(0);
});
