import type { Locator } from "@playwright/test";
import { expect, openDialog, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { signedInClient, sql } from "../seam/harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordBill } from "../seam/fixtures";

const PAGES = ["/", "/inward", "/sell", "/yard", "/customers", "/public-link", "/settings", "/login", "/catalog"];

test.beforeAll(async () => {
  await ensureTestUsers();
});

test("capture every page", async ({ page, signIn }, testInfo) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to capture");
  await resetDomainData();
  await seedYard();
  await sql(`update public.settings set catalog_public = true, whatsapp_number = '+91 98765 43210'`);
  await signIn("admin");
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const name = path === "/" ? "overview" : path.slice(1).replace(/\//g, "-");
    await page.screenshot({ path: `${process.env.CAPTURE}/${testInfo.project.name}-${name}.png`, fullPage: true });
    if (path === "/") {
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      const panel = page.getByTestId("chat-panel");
      await panel.getByRole("textbox", { name: "Ask a question" }).fill("stale by supplier");
      await panel.getByRole("button", { name: "Send" }).click();
      await expect(panel.locator("[data-slot='chart']")).toBeVisible();
      await page.screenshot({ path: `${process.env.CAPTURE}/${testInfo.project.name}-overview-ask.png` });
    }
  }
});

test("capture credit screens", async ({ page, signIn }, testInfo) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to capture");
  await resetDomainData();
  await seedYard();
  const db = await signedInClient("admin");
  const product = await createProduct(db, { name: "Credit Memorial Slab", abbreviation: "CMS", category: "MEMORIAL" });
  const supplier = await createSupplier(db, "Credit Quarry");
  const stock = await createBatch(db, {
    productId: product,
    supplierId: supplier,
    length: null,
    units: 100,
    unitPrice: 1200,
    purchaseDate: daysAgo(60),
  });
  const batchId = stock.data?.id ?? "";
  const bills = [
    { name: "Er. Selvam", phone: "9790054321", type: "ENGINEER", qty: 6, rate: 2400, paid: 8000, sold: 12, payBy: 10 },
    {
      name: "Murugan Constructions",
      phone: "9843012345",
      type: "CONTRACTOR",
      qty: 5,
      rate: 2000,
      paid: 6000,
      sold: 5,
      payBy: 3,
    },
    { name: "Ravi Kumar", phone: "9840011223", type: "REGULAR", qty: 5, rate: 2500, paid: 0, sold: 4, payBy: 3 },
    {
      name: "St. Mary's Church",
      phone: "9443367890",
      type: "TRUST",
      qty: 3,
      rate: 5300,
      paid: 12000,
      sold: 10,
      payBy: 5,
    },
  ] as const;
  const ids: Record<string, string> = {};
  for (const b of bills) {
    ids[b.name] = await createCustomer(db, { name: b.name, phone: b.phone, type: b.type });
    const recorded = await recordBill(db, {
      customerId: ids[b.name] ?? "",
      saleDate: daysAgo(b.sold),
      payments: b.paid === 0 ? [] : [{ payment_mode: "CASH", amount: b.paid }],
      onCredit: true,
      payBy: daysAgo(b.payBy),
      lines: [{ batchId, quantity: b.qty, saleRate: b.rate }],
    });
    if (recorded.error) throw recorded.error;
  }
  const mary = await sql<{ id: string }>(
    `select b.id from public.bills b join public.customers c on c.id = b.customer_id where c.name = $1`,
    ["St. Mary's Church"],
  );
  const extended = await db.rpc("extend_pay_by", { p_bill_id: mary[0]?.id ?? "", p_pay_by: daysAgo(-1) });
  if (extended.error) throw extended.error;

  await signIn("admin");
  const shot = async (name: string, locator?: Locator) => {
    const path = `${process.env.CAPTURE}/${testInfo.project.name}-credit-${name}.png`;
    await (locator ?? page).screenshot({ path });
  };

  await page.goto("/credit");
  await expect(page.getByTestId("credit-card")).toHaveCount(4);
  await page.waitForLoadState("networkidle");
  await shot("list");

  const murugan = page.getByTestId("credit-card").filter({ hasText: "Murugan Constructions" });
  await openDialog(page, murugan.getByRole("button", { name: "Record payment" }));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "UPI" }).click();
  await dialog.getByRole("spinbutton", { name: /Cash/ }).fill("1000");
  await shot("record-mixed", dialog);
  await page.keyboard.press("Escape");

  await openDialog(page, murugan.getByRole("button", { name: "Change date" }));
  await shot("extend", page.getByRole("dialog"));
  await page.keyboard.press("Escape");

  await page.goto(`/customers/${ids["Murugan Constructions"]}`);
  await expect(page.getByTestId("bill-credit").locator("visible=true")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shot("customer");

  await page.goto("/sell");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await expect(page.getByTestId("owes-badge").first()).toBeVisible();
  await shot("picker");
  await page.getByRole("option", { name: /Murugan Constructions/ }).click();
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /Black Pearl · 4×2 ft, 16mm/ }).click();
  await page.getByLabel("Quantity Sold").fill("5");
  await page.getByLabel("Stone Sale Price (₹)").fill("250");
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("switch", { name: /Part payment/ }).click();
  await page.getByRole("spinbutton", { name: /Cash/ }).fill("6000");
  await expect(page.getByTestId("credit-tile")).toBeVisible();
  await shot("sell-tile", page.getByTestId("order-summary"));
});
