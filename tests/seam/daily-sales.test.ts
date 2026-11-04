import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import {
  createBatch,
  createCustomer,
  createProduct,
  createSupplier,
  daysAgo,
  recordBill,
  recordSale,
  today,
  type BillPayment,
} from "./fixtures";

describe("daily summary: what one day sold and what came in", () => {
  let admin: Db;
  let operator: Db;
  let stranger: Db;
  let customerId: string;
  let batch: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
    stranger = await signedInClient("stranger");
  });

  beforeEach(async () => {
    await resetDomainData();
    const product = await createProduct(operator, { name: "Memorial Slab", abbreviation: "MS", category: "MEMORIAL" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions", phone: "9843012345" });
    const { data, error } = await createBatch(operator, {
      productId: product,
      supplierId,
      length: null,
      units: 100,
      unitPrice: 7600,
      purchaseDate: daysAgo(60),
    });
    if (error) throw error;
    batch = data?.id ?? "";
  });

  async function creditBill(saleDate: string, paid: readonly BillPayment[], quantity = 5): Promise<string> {
    const { error } = await recordBill(operator, {
      customerId,
      saleDate,
      payments: paid,
      onCredit: true,
      lines: [{ batchId: batch, quantity, saleRate: 10000 }],
    });
    if (error) throw error;
    return (await sql<{ id: string }>(`select id from public.bills order by created_at desc limit 1`))[0]?.id ?? "";
  }

  async function laterPayment(billId: string, paidOn: string, payments: readonly BillPayment[]): Promise<void> {
    const { error } = await operator.rpc("record_credit_payment", {
      p_bill_id: billId,
      p_paid_on: paidOn,
      p_payments: [...payments],
    });
    if (error) throw error;
  }

  async function summary(day: string) {
    const { data, error } = await operator.rpc("daily_summary", { p_date: day }).single();
    if (error) throw error;
    return data;
  }

  it("adds a day's credit Bill and a later payment on an older Bill into one reconciling summary", async () => {
    const older = await creditBill(daysAgo(7), [{ payment_mode: "CASH", amount: 1000 }], 1);
    await creditBill(today(), [
      { payment_mode: "CASH", amount: 15000 },
      { payment_mode: "UPI", amount: 5000 },
    ]);
    await laterPayment(older, today(), [{ payment_mode: "UPI", amount: 4000 }]);

    expect(await summary(today())).toEqual({
      billed: 50000,
      margin: 12000,
      margin_pct: 24,
      cash: 15000,
      upi: 9000,
      bank_transfer: 0,
      received: 24000,
      added_to_credit: 30000,
    });
  });

  it("gives the same money as the Overview Money received card for that day", async () => {
    const older = await creditBill(daysAgo(7), [{ payment_mode: "CASH", amount: 1000 }], 1);
    await creditBill(today(), [{ payment_mode: "BANK_TRANSFER", amount: 2000 }]);
    await laterPayment(older, today(), [
      { payment_mode: "CASH", amount: 300 },
      { payment_mode: "UPI", amount: 700 },
    ]);

    const { data, error } = await operator
      .rpc("received_by_period", { p_range: "custom", p_from: today(), p_to: today() })
      .single();
    if (error) throw error;
    const day = await summary(today());
    expect({ cash: day.cash, upi: day.upi, bank: day.bank_transfer, total: day.received }).toEqual({
      cash: data.cash,
      upi: data.upi,
      bank: data.bank_transfer,
      total: data.total,
    });
  });

  it("counts a Sale without a Bill and a paid Bill in full, with nothing added to credit", async () => {
    const { error: saleError } = await recordSale(operator, {
      batchId: batch,
      customerId,
      saleDate: today(),
      quantity: 1,
      saleRate: 10000,
      paymentMode: "UPI",
    });
    if (saleError) throw saleError;
    const { error: billError } = await recordBill(operator, {
      customerId,
      saleDate: today(),
      payments: [
        { payment_mode: "CASH", amount: 12000 },
        { payment_mode: "BANK_TRANSFER", amount: 8000 },
      ],
      lines: [{ batchId: batch, quantity: 2, saleRate: 10000 }],
    });
    if (billError) throw billError;

    expect(await summary(today())).toMatchObject({
      billed: 30000,
      cash: 12000,
      upi: 10000,
      bank_transfer: 8000,
      received: 30000,
      added_to_credit: 0,
    });
  });

  it("puts a backdated Sale on its Sale date and a later payment on the day it was received", async () => {
    const bill = await creditBill(daysAgo(3), [{ payment_mode: "CASH", amount: 20000 }]);
    await laterPayment(bill, daysAgo(1), [{ payment_mode: "UPI", amount: 4000 }]);

    expect(await summary(daysAgo(3))).toMatchObject({ billed: 50000, received: 20000, added_to_credit: 30000 });
    expect(await summary(daysAgo(1))).toMatchObject({ billed: 0, received: 4000, added_to_credit: 0 });
    expect(await summary(today())).toMatchObject({ billed: 0, received: 0 });
  });

  it("keeps Added to credit as it stood at the sale after the Bill is paid off", async () => {
    const bill = await creditBill(daysAgo(2), [{ payment_mode: "CASH", amount: 20000 }]);
    await laterPayment(bill, today(), [{ payment_mode: "CASH", amount: 30000 }]);

    expect(await summary(daysAgo(2))).toMatchObject({ added_to_credit: 30000 });
  });

  it("shows zeros and no percentage on a day with no activity", async () => {
    expect(await summary(daysAgo(20))).toEqual({
      billed: 0,
      margin: 0,
      margin_pct: null,
      cash: 0,
      upi: 0,
      bank_transfer: 0,
      received: 0,
      added_to_credit: 0,
    });
  });

  it("refuses a future date", async () => {
    const error = expectError(await operator.rpc("daily_summary", { p_date: daysAgo(-1) }));
    expect(error.message).toBe("The date cannot be in the future");
  });

  it("works for both roles, shows a stranger nothing and refuses anonymous callers", async () => {
    await creditBill(today(), [{ payment_mode: "CASH", amount: 20000 }]);

    const asAdmin = await admin.rpc("daily_summary", { p_date: today() }).single();
    expect(asAdmin.data).toMatchObject({ billed: 50000 });
    const asStranger = await stranger.rpc("daily_summary", { p_date: today() }).single();
    expect(asStranger.data).toMatchObject({ billed: 0, received: 0, added_to_credit: 0 });
    const { error } = await anonClient().rpc("daily_summary", { p_date: today() });
    expect(error).not.toBeNull();
  });
});
