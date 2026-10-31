import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
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

describe("bill payments: a Bill paid in more than one Payment Mode", () => {
  let admin: Db;
  let operator: Db;
  let customerId: string;
  let supplierId: string;
  let product: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    product = await createProduct(operator, { name: "Memorial Slab", abbreviation: "MS", category: "MEMORIAL" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions" });
  });

  async function memorialBatch(landedCost: number): Promise<string> {
    const { data, error } = await createBatch(operator, {
      productId: product,
      supplierId,
      length: null,
      units: 100,
      unitPrice: landedCost,
      purchaseDate: daysAgo(10),
    });
    if (error) throw error;
    return data?.id ?? "";
  }

  async function payments(billId: string) {
    const { data } = await admin
      .from("bill_payments")
      .select("payment_mode, amount")
      .eq("bill_id", billId)
      .order("payment_mode");
    return data;
  }

  async function onlyBill(): Promise<string> {
    return (await sql<{ id: string }>(`select id from public.bills`))[0]?.id ?? "";
  }

  async function count(table: "bills" | "sales" | "bill_payments"): Promise<number> {
    return Number((await sql<{ n: string }>(`select count(*) as n from public.${table}`))[0]?.n);
  }

  function correct(input: {
    readonly saleId: string;
    readonly batchId: string;
    readonly quantity: number;
    readonly split?: readonly BillPayment[];
  }) {
    return admin.rpc("correct_sale", {
      p_sale_id: input.saleId,
      p_batch_id: input.batchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: input.quantity,
      p_sale_rate: 2000,
      p_payments: input.split ? [...input.split] : undefined,
    });
  }

  it("records a split that adds up to the Bill total", async () => {
    const batch = await memorialBatch(1520);
    const { error } = await recordBill(operator, {
      customerId,
      payments: [
        { payment_mode: "CASH", amount: 30000 },
        { payment_mode: "UPI", amount: 20000 },
      ],
      lines: [{ batchId: batch, quantity: 25, saleRate: 2000 }],
    });
    expect(error).toBeNull();
    expect(await payments(await onlyBill())).toEqual([
      { payment_mode: "CASH", amount: 30000 },
      { payment_mode: "UPI", amount: 20000 },
    ]);
  });

  it("takes the Bill total for a single Payment Mode whatever amount is sent", async () => {
    const batch = await memorialBatch(1520);
    const { error } = await recordBill(operator, {
      customerId,
      payments: [{ payment_mode: "UPI", amount: 1 }],
      lines: [{ batchId: batch, quantity: 2, saleRate: 2000 }],
    });
    expect(error).toBeNull();
    expect(await payments(await onlyBill())).toEqual([{ payment_mode: "UPI", amount: 4000 }]);
  });

  it("refuses a split that does not add up, repeats a mode, has a zero or missing amount, or is empty, and records nothing", async () => {
    const batch = await memorialBatch(1520);
    const refusals: readonly { readonly split: Json; readonly message: string }[] = [
      {
        split: [
          { payment_mode: "CASH", amount: 30000 },
          { payment_mode: "UPI", amount: 15000 },
        ],
        message: "Payments add up to ₹45000 but the bill total is ₹50000",
      },
      {
        split: [
          { payment_mode: "CASH", amount: 25000 },
          { payment_mode: "CASH", amount: 25000 },
        ],
        message: "Each payment mode can appear only once on a bill",
      },
      {
        split: [
          { payment_mode: "CASH", amount: 50000 },
          { payment_mode: "UPI", amount: 0 },
        ],
        message: "Each payment in a split must be more than zero",
      },
      {
        split: [{ payment_mode: "CASH", amount: 50000 }, { payment_mode: "UPI" }],
        message: "Enter an amount for each payment mode",
      },
      { split: [], message: "Pick at least one payment mode" },
      { split: [{ payment_mode: "CHEQUE" }], message: "Payment mode must be Cash, UPI or Bank Transfer" },
    ];
    for (const { split, message } of refusals) {
      const { error } = await operator.rpc("record_bill", {
        p_customer_id: customerId,
        p_sale_date: today(),
        p_payments: split,
        p_lines: [{ batch_id: batch, quantity: 25, sale_rate: 2000 }],
      });
      expect(expectError({ error }).message).toBe(message);
    }
    expect(await count("bills")).toBe(0);
    expect(await count("sales")).toBe(0);
    expect(await count("bill_payments")).toBe(0);
  });

  it("gives members no way to write a payment directly", async () => {
    const batch = await memorialBatch(1520);
    await recordBill(operator, { customerId, lines: [{ batchId: batch, saleRate: 2000 }] });
    const billId = await onlyBill();
    expectError(await operator.from("bill_payments").insert({ bill_id: billId, payment_mode: "UPI", amount: 1 }));
    const update = await admin.from("bill_payments").update({ amount: 1 }).eq("bill_id", billId).select();
    expect(update.data ?? []).toEqual([]);
    expect(await payments(billId)).toEqual([{ payment_mode: "CASH", amount: 2000 }]);
  });

  describe("corrections on a split Bill", () => {
    let batch: string;
    let billId: string;
    let firstSaleId: string;
    let secondSaleId: string;

    beforeEach(async () => {
      batch = await memorialBatch(1520);
      const other = await memorialBatch(1600);
      const recorded = await recordBill(operator, {
        customerId,
        payments: [
          { payment_mode: "CASH", amount: 30000 },
          { payment_mode: "UPI", amount: 20000 },
        ],
        lines: [
          { batchId: batch, quantity: 15, saleRate: 2000 },
          { batchId: other, quantity: 10, saleRate: 2000 },
        ],
      });
      expect(recorded.error).toBeNull();
      billId = await onlyBill();
      const sales = await admin.from("sales").select("id, batch_id");
      firstSaleId = sales.data?.find((s) => s.batch_id === batch)?.id ?? "";
      secondSaleId = sales.data?.find((s) => s.batch_id === other)?.id ?? "";
    });

    it("refuses an edit that changes the total without a new split and changes nothing", async () => {
      const refused = await correct({ saleId: firstSaleId, batchId: batch, quantity: 14 });
      expect(expectError(refused).message).toBe("The bill total is now ₹48000; enter how it was paid");
      const stored = await admin.from("sales").select("quantity").eq("id", firstSaleId).single();
      expect(stored.data?.quantity).toBe(15);
    });

    it("accepts an edit that changes the total with a split that adds up to the new total", async () => {
      const changed = await correct({
        saleId: firstSaleId,
        batchId: batch,
        quantity: 14,
        split: [
          { payment_mode: "CASH", amount: 28000 },
          { payment_mode: "UPI", amount: 20000 },
        ],
      });
      expect(changed.error).toBeNull();
      expect(await payments(billId)).toEqual([
        { payment_mode: "CASH", amount: 28000 },
        { payment_mode: "UPI", amount: 20000 },
      ]);
    });

    it("refuses a new split that does not add up to the new total", async () => {
      const refused = await correct({
        saleId: firstSaleId,
        batchId: batch,
        quantity: 14,
        split: [
          { payment_mode: "CASH", amount: 30000 },
          { payment_mode: "UPI", amount: 20000 },
        ],
      });
      expect(expectError(refused).message).toBe("Payments add up to ₹50000 but the bill total is ₹48000");
    });

    it("keeps the split on an edit that leaves the total alone", async () => {
      expect((await correct({ saleId: firstSaleId, batchId: batch, quantity: 15 })).error).toBeNull();
      expect(await payments(billId)).toHaveLength(2);
    });

    it("changes only the split when nothing else changes", async () => {
      const fixed = await correct({
        saleId: firstSaleId,
        batchId: batch,
        quantity: 15,
        split: [
          { payment_mode: "CASH", amount: 25000 },
          { payment_mode: "BANK_TRANSFER", amount: 25000 },
        ],
      });
      expect(fixed.error).toBeNull();
      expect(await payments(billId)).toEqual([
        { payment_mode: "BANK_TRANSFER", amount: 25000 },
        { payment_mode: "CASH", amount: 25000 },
      ]);
    });

    it("collapses to one Payment Mode when the split names one", async () => {
      const collapsed = await correct({
        saleId: firstSaleId,
        batchId: batch,
        quantity: 15,
        split: [{ payment_mode: "UPI" }],
      });
      expect(collapsed.error).toBeNull();
      expect(await payments(billId)).toEqual([{ payment_mode: "UPI", amount: 50000 }]);
    });

    it("refuses deleting a Sale from a split Bill without a new split", async () => {
      const refused = await admin.rpc("delete_sale", { p_sale_id: secondSaleId });
      expect(expectError(refused).message).toBe("The bill total is now ₹30000; enter how it was paid");
      expect(await count("sales")).toBe(2);
    });

    it("deletes a Sale from a split Bill with a split that adds up to what is left", async () => {
      const deleted = await admin.rpc("delete_sale", {
        p_sale_id: secondSaleId,
        p_payments: [
          { payment_mode: "CASH", amount: 20000 },
          { payment_mode: "UPI", amount: 10000 },
        ],
      });
      expect(deleted.error).toBeNull();
      expect(await payments(billId)).toEqual([
        { payment_mode: "CASH", amount: 20000 },
        { payment_mode: "UPI", amount: 10000 },
      ]);
    });

    it("removes the payments with the Bill when its last Sale goes", async () => {
      await admin.rpc("delete_sale", { p_sale_id: secondSaleId, p_payments: [{ payment_mode: "CASH" }] });
      expect((await admin.rpc("delete_sale", { p_sale_id: firstSaleId })).error).toBeNull();
      expect(await count("bills")).toBe(0);
      expect(await count("bill_payments")).toBe(0);
    });
  });

  describe("a Bill paid in one Payment Mode", () => {
    let batch: string;
    let billId: string;
    let firstSaleId: string;
    let secondSaleId: string;

    beforeEach(async () => {
      batch = await memorialBatch(1520);
      const other = await memorialBatch(1600);
      await recordBill(operator, {
        customerId,
        paymentMode: "CASH",
        lines: [
          { batchId: batch, quantity: 15, saleRate: 2000 },
          { batchId: other, quantity: 10, saleRate: 2000 },
        ],
      });
      billId = await onlyBill();
      const sales = await admin.from("sales").select("id, batch_id");
      firstSaleId = sales.data?.find((s) => s.batch_id === batch)?.id ?? "";
      secondSaleId = sales.data?.find((s) => s.batch_id === other)?.id ?? "";
    });

    it("follows its total on an edit with no split asked", async () => {
      expect((await correct({ saleId: firstSaleId, batchId: batch, quantity: 14 })).error).toBeNull();
      expect(await payments(billId)).toEqual([{ payment_mode: "CASH", amount: 48000 }]);
    });

    it("follows its total on a delete with no split asked", async () => {
      expect((await admin.rpc("delete_sale", { p_sale_id: secondSaleId })).error).toBeNull();
      expect(await payments(billId)).toEqual([{ payment_mode: "CASH", amount: 30000 }]);
    });
  });

  it("refuses a split on a Sale that is not on a Bill", async () => {
    const batch = await memorialBatch(1520);
    const sale = await recordSale(operator, { batchId: batch, customerId, saleRate: 2000 });
    const refused = await admin.rpc("correct_sale", {
      p_sale_id: sale.data?.id ?? "",
      p_batch_id: batch,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 2000,
      p_payment_mode: "CASH",
      p_payments: [{ payment_mode: "UPI" }],
    });
    expect(expectError(refused).message).toBe("Only a sale on a bill takes a payment split");
  });

  describe("payments_by_mode", () => {
    it("shares a mixed Bill's Margin in proportion to payment and counts a Sale without a Bill to its one mode", async () => {
      await recordBill(operator, {
        customerId,
        payments: [
          { payment_mode: "CASH", amount: 30000 },
          { payment_mode: "UPI", amount: 20000 },
        ],
        lines: [{ batchId: await memorialBatch(1520), quantity: 25, saleRate: 2000 }],
      });
      await recordBill(operator, {
        customerId,
        paymentMode: "CASH",
        lines: [{ batchId: await memorialBatch(1550), quantity: 20, saleRate: 2000 }],
      });
      await recordBill(operator, {
        customerId,
        paymentMode: "UPI",
        lines: [{ batchId: await memorialBatch(1900), quantity: 10, saleRate: 2500 }],
      });
      const lone = await recordSale(operator, {
        batchId: await memorialBatch(2250),
        customerId,
        quantity: 20,
        saleRate: 3000,
        paymentMode: "BANK_TRANSFER",
      });
      expect(lone.error).toBeNull();

      const { data, error } = await operator.rpc("payments_by_mode", {
        p_range: "custom",
        p_from: daysAgo(30),
        p_to: today(),
      });
      expect(error).toBeNull();
      expect(data?.map(({ range_from: _from, range_to: _to, ...row }) => row)).toEqual([
        { payment_mode: "CASH", collected: 70000, margin: 16200, margin_pct: 23.14 },
        { payment_mode: "UPI", collected: 45000, margin: 10800, margin_pct: 24 },
        { payment_mode: "BANK_TRANSFER", collected: 60000, margin: 15000, margin_pct: 25 },
      ]);
    });

    it("rounds shares to the paisa so the rows add up exactly to the Margin", async () => {
      await recordBill(operator, {
        customerId,
        payments: [
          { payment_mode: "CASH", amount: 1000 },
          { payment_mode: "UPI", amount: 1000 },
          { payment_mode: "BANK_TRANSFER", amount: 1000 },
        ],
        lines: [{ batchId: await memorialBatch(2900), quantity: 1, saleRate: 3000 }],
      });
      const { data } = await operator.rpc("payments_by_mode", { p_range: "custom", p_from: today(), p_to: today() });
      const shares = (data ?? []).map((r) => r.margin);
      expect(shares.toSorted()).toEqual([33.33, 33.33, 33.34]);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    });

    it("leaves out Sales outside the range and shows every mode even with nothing in it", async () => {
      await recordBill(operator, {
        customerId,
        saleDate: daysAgo(5),
        lines: [{ batchId: await memorialBatch(1520), quantity: 1, saleRate: 2000 }],
      });
      const { data } = await operator.rpc("payments_by_mode", { p_range: "custom", p_from: daysAgo(2), p_to: today() });
      expect(data).toEqual(
        ["CASH", "UPI", "BANK_TRANSFER"].map((mode) => ({
          payment_mode: mode,
          collected: 0,
          margin: 0,
          margin_pct: null,
          range_from: daysAgo(2),
          range_to: today(),
        })),
      );
    });

    it("refuses a start date after the end date and an end date in the future", async () => {
      const backwards = await operator.rpc("payments_by_mode", {
        p_range: "custom",
        p_from: today(),
        p_to: daysAgo(1),
      });
      expect(expectError(backwards).message).toBe("The start date must be on or before the end date");
      const future = await operator.rpc("payments_by_mode", { p_range: "custom", p_from: today(), p_to: daysAgo(-1) });
      expect(expectError(future).message).toBe("The end date cannot be in the future");
    });

    it("covers this week from Monday and this month from the 1st, both to today in India", async () => {
      const today_ = today();
      const week = await operator.rpc("payments_by_mode", { p_range: "week" });
      const month = await operator.rpc("payments_by_mode", { p_range: "month" });
      const monday = (
        await sql<{ d: string }>(
          `select to_char(date_trunc('week', private.ist_today()::timestamp), 'YYYY-MM-DD') as d`,
        )
      )[0]?.d;
      expect(week.data?.[0]).toMatchObject({ range_from: monday, range_to: today_ });
      expect(month.data?.[0]).toMatchObject({ range_from: `${today_.slice(0, 8)}01`, range_to: today_ });
    });
  });
});
