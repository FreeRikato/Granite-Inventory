import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { createCustomer, recordBill } from "../seam/fixtures";
import { signedInClient, sql, TEST_USERS } from "../seam/harness";

test.beforeAll(async () => {
  await ensureTestUsers();
});

let customerId = "";

test.beforeEach(async () => {
  await resetDomainData();
  const { newBatchId } = await seedYard();
  const operator = await signedInClient("operator");
  customerId = await createCustomer(operator, { name: "Murugan Constructions" });
  await recordBill(operator, {
    customerId,
    onCredit: true,
    payments: [{ payment_mode: "CASH", amount: 100 }],
    lines: [{ batchId: newBatchId, quantity: 1, saleRate: 300 }],
  });
  await sql(`update public.team_members set role = 'YARD_OPERATOR' where email = $1`, [TEST_USERS.viewer.email]);
});

test.afterEach(async () => {
  await sql(`update public.team_members set role = 'VIEWER' where email = $1`, [TEST_USERS.viewer.email]);
});

test("an Admin makes a Team Member a Viewer, who reads every screen with no write controls", async ({
  page,
  signIn,
}) => {
  await signIn("admin");
  await page.goto("/settings");
  await page.getByRole("combobox", { name: `Role for ${TEST_USERS.viewer.email}` }).click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await expect(page.getByText("Role updated")).toBeVisible();

  await page.context().clearCookies();
  await signIn("viewer");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ask/i }).first()).toBeVisible();
  await expect(page.getByTestId("kpi-outstanding")).toHaveText("₹2,300");

  for (const yard of ["/yard", "/yard?group=size"]) {
    await page.goto(yard);
    await expect(page.getByTestId("yard-batch").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sell from this Batch" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Edit|Archive|Delete)/ })).toHaveCount(0);
  }

  await page.goto("/sell");
  await expect(page.getByText("a Viewer cannot record a Sale")).toBeVisible();
  await expect(page.getByRole("button", { name: /Record Sale/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to order" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add new customer" })).toHaveCount(0);

  await page.goto("/inward");
  await expect(page.getByText("a Viewer cannot save a Batch")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Batch" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add new product" })).toHaveCount(0);

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Customer" })).toHaveCount(0);

  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await page.goto("/credit");
  await expect(page.getByTestId("credit-balance").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change date" })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByTestId("member-row").filter({ hasText: TEST_USERS.admin.email })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Role for/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite a Google account" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save rules" })).toHaveCount(0);
});
