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
      sqft: 0,
      customer_sqft: [{ customer_id: customerId, customer_name: "Murugan Constructions", sqft: null }],
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
      sqft: 0,
      customer_sqft: [],
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
    expect(asStranger.data).toMatchObject({ billed: 0, received: 0, added_to_credit: 0, sqft: 0, customer_sqft: [] });
    const { error } = await anonClient().rpc("daily_summary", { p_date: today() });
    expect(error).not.toBeNull();
  });
});

describe("daily summary: square feet sold", () => {
  let admin: Db;
  let operator: Db;
  let supplierId: string;
  let productId: string;
  let murugan: string;
  let selvam: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    murugan = await createCustomer(operator, { name: "Murugan Constructions", phone: "9843012345" });
    selvam = await createCustomer(operator, { name: "Selvam Traders", phone: "9843012399" });
  });

  async function sized(length: number, breadth: number): Promise<string> {
    const { data, error } = await createBatch(operator, {
      productId,
      supplierId,
      length,
      breadth,
      units: 50,
      unitPrice: 100,
      purchaseDate: daysAgo(30),
    });
    if (error) throw error;
    return data?.id ?? "";
  }

  async function memorial(): Promise<string> {
    const doom = await createProduct(operator, { name: "Doom Stone", abbreviation: "DS", category: "MEMORIAL" });
    const { data, error } = await createBatch(operator, {
      productId: doom,
      supplierId,
      length: null,
      units: 50,
      unitPrice: 1000,
      purchaseDate: daysAgo(30),
    });
    if (error) throw error;
    return data?.id ?? "";
  }

  async function sale(batchId: string, customerId: string, quantity: number, saleDate = today()): Promise<string> {
    const { data, error } = await recordSale(operator, { batchId, customerId, quantity, saleRate: 200, saleDate });
    if (error) throw error;
    return data?.id ?? "";
  }

  async function squareFeet(day: string) {
    const { data, error } = await operator.rpc("daily_summary", { p_date: day }).single();
    if (error) throw error;
    return { total: data.sqft, customers: data.customer_sqft };
  }

  it("adds 1x1, 1x2, 1x3 and 1x4 on one Bill up to 10 square feet", async () => {
    const lines = await Promise.all([sized(1, 1), sized(1, 2), sized(1, 3), sized(1, 4)]);
    const { error } = await recordBill(operator, {
      customerId: murugan,
      lines: lines.map((batchId) => ({ batchId, quantity: 1, saleRate: 200 })),
    });
    if (error) throw error;

    expect(await squareFeet(today())).toEqual({
      total: 10,
      customers: [{ customer_id: murugan, customer_name: "Murugan Constructions", sqft: 10 }],
    });
  });

  it("multiplies Area by pieces and keeps one row per Customer, largest first", async () => {
    const fourByTwo = await sized(4, 2);
    const fiveByThree = await sized(5, 3);
    await sale(fourByTwo, murugan, 2);
    await sale(fiveByThree, selvam, 3);
    const { error } = await recordBill(operator, {
      customerId: murugan,
      lines: [{ batchId: fourByTwo, quantity: 1, saleRate: 200 }],
    });
    if (error) throw error;

    expect(await squareFeet(today())).toEqual({
      total: 69,
      customers: [
        { customer_id: selvam, customer_name: "Selvam Traders", sqft: 45 },
        { customer_id: murugan, customer_name: "Murugan Constructions", sqft: 24 },
      ],
    });
  });

  it("keeps a fractional Area exact", async () => {
    await sale(await sized(4.5, 2.25), murugan, 3);

    expect((await squareFeet(today())).total).toBe(30.375);
  });

  it("shows the Walk-in Customer as one row however many buyers it covers", async () => {
    const [walkIn] = await sql<{ id: string }>(`select id from public.customers where is_walk_in`);
    const batch = await sized(4, 2);
    await sale(batch, walkIn?.id ?? "", 1);
    await sale(batch, walkIn?.id ?? "", 2);

    const { customers } = await squareFeet(today());
    expect(customers).toHaveLength(1);
    expect(customers).toMatchObject([{ customer_id: walkIn?.id, sqft: 24 }]);
  });

  it("leaves Memorial out, with no figure for a Customer who bought only Memorial", async () => {
    const doom = await memorial();
    await sale(await sized(4, 2), murugan, 1);
    await sale(doom, murugan, 5);
    await sale(doom, selvam, 2);

    expect(await squareFeet(today())).toEqual({
      total: 8,
      customers: [
        { customer_id: murugan, customer_name: "Murugan Constructions", sqft: 8 },
        { customer_id: selvam, customer_name: "Selvam Traders", sqft: null },
      ],
    });
  });

  it("puts a backdated Sale on its Sale date", async () => {
    await sale(await sized(4, 2), murugan, 1, daysAgo(3));

    expect((await squareFeet(daysAgo(3))).total).toBe(8);
    expect(await squareFeet(today())).toEqual({ total: 0, customers: [] });
  });

  it("keeps the Area of the Sale when the Batch's Size is edited later", async () => {
    const batch = await sized(4, 2);
    await sale(batch, murugan, 2);

    const { error } = await admin.rpc("correct_batch", {
      p_batch_id: batch,
      p_product_id: productId,
      p_variant_name: "Grade 1",
      p_supplier_id: supplierId,
      p_purchase_date: daysAgo(30),
      p_length_ft: 5,
      p_breadth_ft: 3,
      p_thickness_mm: 16,
      p_initial_units: 50,
      p_unit_purchase_price: 100,
      p_freight_cost: 0,
      p_stack_number: "1",
    });
    if (error) throw error;

    expect((await squareFeet(today())).total).toBe(16);
  });

  it("follows a Correction, and a deleted Sale or Bill takes its square feet with it", async () => {
    const fourByTwo = await sized(4, 2);
    const fiveByThree = await sized(5, 3);
    const id = await sale(fourByTwo, murugan, 2);
    const other = await sale(fourByTwo, selvam, 1);
    const correction = {
      p_sale_id: id,
      p_customer_id: murugan,
      p_sale_date: today(),
      p_sale_rate: 200,
      p_payment_mode: "CASH",
      p_has_stickering: false,
      p_stickering_cost_rate: 0,
      p_stickering_rate: 0,
    };

    const fewer = await admin.rpc("correct_sale", { ...correction, p_batch_id: fourByTwo, p_quantity: 1 });
    if (fewer.error) throw fewer.error;
    expect((await squareFeet(today())).total).toBe(16);

    const moved = await admin.rpc("correct_sale", { ...correction, p_batch_id: fiveByThree, p_quantity: 1 });
    if (moved.error) throw moved.error;
    expect((await squareFeet(today())).total).toBe(23);

    const gone = await admin.rpc("delete_sale", { p_sale_id: other });
    if (gone.error) throw gone.error;
    expect((await squareFeet(today())).customers).toMatchObject([{ customer_id: murugan, sqft: 15 }]);

    const billed = await recordBill(operator, {
      customerId: selvam,
      lines: [{ batchId: fourByTwo, quantity: 4, saleRate: 200 }],
    });
    if (billed.error) throw billed.error;
    expect((await squareFeet(today())).total).toBe(47);
    const [bill] = await sql<{ id: string }>(`select id from public.bills`);
    const billGone = await admin.rpc("delete_bill", { p_bill_id: bill?.id ?? "" });
    if (billGone.error) throw billGone.error;
    expect((await squareFeet(today())).total).toBe(15);
  });
});
