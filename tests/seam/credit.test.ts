import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Json } from "@/lib/database.types";
import { defaultPayBy } from "@/lib/credit";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import {
  createBatch,
  createCustomer,
  createProduct,
  createSupplier,
  daysAgo,
  recordBill,
  today,
  type BillPayment,
} from "./fixtures";

const NO_BILL = "00000000-0000-0000-0000-000000000000";

function total(rows: readonly { readonly collected: number; readonly margin: number }[], key: "collected" | "margin") {
  return Math.round(rows.reduce((sum, r) => sum + Number(r[key]), 0) * 100) / 100;
}

describe("credit: a Bill sold on credit and paid later", () => {
  let admin: Db;
  let operator: Db;
  let stranger: Db;
  let customerId: string;
  let supplierId: string;
  let product: string;
  let batch: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
    stranger = await signedInClient("stranger");
  });

  beforeEach(async () => {
    await resetDomainData();
    product = await createProduct(operator, { name: "Memorial Slab", abbreviation: "MS", category: "MEMORIAL" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions", phone: "9843012345" });
    const { data, error } = await createBatch(operator, {
      productId: product,
      supplierId,
      length: null,
      units: 100,
      unitPrice: 1400,
      purchaseDate: daysAgo(60),
    });
    if (error) throw error;
    batch = data?.id ?? "";
  });

  async function creditBill(input: {
    readonly paid?: readonly BillPayment[];
    readonly saleDate?: string;
    readonly payBy?: string;
    readonly quantity?: number;
  }): Promise<string> {
    const { error } = await recordBill(operator, {
      customerId,
      saleDate: input.saleDate ?? daysAgo(5),
      payments: input.paid ?? [{ payment_mode: "CASH", amount: 6000 }],
      onCredit: true,
      payBy: input.payBy,
      lines: [{ batchId: batch, quantity: input.quantity ?? 5, saleRate: 2000 }],
    });
    if (error) throw error;
    return (await sql<{ id: string }>(`select id from public.bills order by created_at desc limit 1`))[0]?.id ?? "";
  }

  async function row(billId: string) {
    const { data, error } = await admin.from("v_credit").select("*").eq("bill_id", billId).single();
    if (error) throw error;
    return data;
  }

  function pay(billId: string, paid: readonly BillPayment[], paidOn: string = today(), who: Db = operator) {
    return who.rpc("record_credit_payment", { p_bill_id: billId, p_paid_on: paidOn, p_payments: [...paid] });
  }

  async function receiptIds(billId: string): Promise<string[]> {
    const found = await sql<{ id: string }>(
      `select id from public.credit_payments where bill_id = $1 order by paid_on, created_at`,
      [billId],
    );
    return found.map((r) => r.id);
  }

  async function plainBill(): Promise<string> {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId: batch, quantity: 1, saleRate: 2000 }],
    });
    if (error) throw error;
    return (await sql<{ id: string }>(`select id from public.bills where not on_credit`))[0]?.id ?? "";
  }

  describe("selling on credit", () => {
    it("keeps the payment made now and leaves the rest as the balance", async () => {
      const billId = await creditBill({});
      const bill = await admin.from("bills").select("on_credit").eq("id", billId).single();
      expect(bill.data?.on_credit).toBe(true);
      const stored = await admin.from("bill_payments").select("payment_mode, amount").eq("bill_id", billId);
      expect(stored.data).toEqual([{ payment_mode: "CASH", amount: 6000 }]);
      expect(await row(billId)).toMatchObject({ total: 10000, paid: 6000, balance: 4000 });
    });

    it("accepts a part payment in two modes and one of nothing", async () => {
      const split = await creditBill({
        paid: [
          { payment_mode: "CASH", amount: 1000 },
          { payment_mode: "UPI", amount: 2000 },
        ],
      });
      expect(await row(split)).toMatchObject({ paid: 3000, balance: 7000 });
      const none = await creditBill({ paid: [] });
      expect(await row(none)).toMatchObject({ paid: 0, balance: 10000 });
      expect((await admin.from("bill_payments").select("*").eq("bill_id", none)).data).toEqual([]);
    });

    it("drops a mode typed as zero instead of storing it", async () => {
      const billId = await creditBill({
        paid: [
          { payment_mode: "CASH", amount: 4000 },
          { payment_mode: "UPI", amount: 0 },
        ],
      });
      const stored = await admin.from("bill_payments").select("payment_mode").eq("bill_id", billId);
      expect(stored.data).toEqual([{ payment_mode: "CASH" }]);
    });

    it("refuses a payment that reaches or passes the total, a repeated mode and a bad amount, and records nothing", async () => {
      const refusals: readonly { readonly paid: Json; readonly message: string }[] = [
        {
          paid: [{ payment_mode: "CASH", amount: 10000 }],
          message: "Paid now must be less than the bill total of ₹10000",
        },
        {
          paid: [
            { payment_mode: "CASH", amount: 6000 },
            { payment_mode: "UPI", amount: 5000 },
          ],
          message: "Paid now must be less than the bill total of ₹10000",
        },
        {
          paid: [
            { payment_mode: "CASH", amount: 1000 },
            { payment_mode: "CASH", amount: 1000 },
          ],
          message: "Each payment mode can appear only once on a bill",
        },
        { paid: [{ payment_mode: "CASH", amount: -1 }], message: "Each payment must be zero or more" },
        { paid: [{ payment_mode: "CASH" }], message: "Enter an amount for each payment mode" },
      ];
      for (const { paid, message } of refusals) {
        const { error } = await operator.rpc("record_bill", {
          p_customer_id: customerId,
          p_sale_date: today(),
          p_payments: paid,
          p_lines: [{ batch_id: batch, quantity: 5, sale_rate: 2000 }],
          p_on_credit: true,
        });
        expect(expectError({ error }).message).toBe(message);
      }
      expect(await sql(`select 1 from public.bills`)).toEqual([]);
      expect(await sql(`select 1 from public.sales`)).toEqual([]);
    });

    it("refuses credit for the Walk-in Customer", async () => {
      const walkIn = (await sql<{ id: string }>(`select id from public.customers where is_walk_in`))[0]?.id ?? "";
      const { error } = await recordBill(operator, {
        customerId: walkIn,
        payments: [{ payment_mode: "CASH", amount: 1000 }],
        onCredit: true,
        lines: [{ batchId: batch, quantity: 5, saleRate: 2000 }],
      });
      expect(expectError({ error }).message).toBe("Credit needs a named Customer");
      expect(await sql(`select 1 from public.bills`)).toEqual([]);
    });

    it("refuses a pay-by date on a bill that is not on credit and one before the sale date", async () => {
      const notCredit = await recordBill(operator, {
        customerId,
        payBy: today(),
        lines: [{ batchId: batch, quantity: 5, saleRate: 2000 }],
      });
      expect(expectError(notCredit).message).toBe("A pay-by date only applies to a bill sold on credit");
      const early = await recordBill(operator, {
        customerId,
        saleDate: daysAgo(5),
        payments: [],
        onCredit: true,
        payBy: daysAgo(6),
        lines: [{ batchId: batch, quantity: 5, saleRate: 2000 }],
      });
      expect(expectError(early).message).toBe("Pay-by date cannot be before the sale date");
    });

    it("leaves a bill that is not on credit as before: paid in full, no balance, no promise", async () => {
      await plainBill();
      expect((await admin.from("v_credit").select("*")).data).toEqual([]);
      expect(await sql(`select 1 from public.credit_promises`)).toEqual([]);
    });
  });

  describe("the first pay-by date", () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ["Monday", "2026-10-05", "2026-10-10"],
      ["Tuesday", "2026-10-06", "2026-10-10"],
      ["Wednesday", "2026-10-07", "2026-10-10"],
      ["Thursday", "2026-10-08", "2026-10-10"],
      ["Friday", "2026-10-09", "2026-10-10"],
      ["Saturday", "2026-10-10", "2026-10-17"],
      ["Sunday", "2026-10-11", "2026-10-17"],
    ];

    it.each(cases)("a %s sale (%s) is due on %s", async (_day, saleDate, expected) => {
      const billId = await creditBill({ saleDate });
      expect(await row(billId)).toMatchObject({ pay_by: expected, original_pay_by: expected });
    });

    it("keeps the date the operator typed as the original", async () => {
      const billId = await creditBill({ saleDate: "2026-10-05", payBy: "2026-10-20" });
      expect(await row(billId)).toMatchObject({ original_pay_by: "2026-10-20", pay_by: "2026-10-20", extensions: 0 });
    });

    it("matches the date the Sell screen shows before the sale is recorded", async () => {
      for (let i = 0; i < 21; i++) {
        const saleDate = daysAgo(40 - i);
        const stored = await sql<{ d: string }>(`select to_char(private.default_pay_by($1::date), 'YYYY-MM-DD') as d`, [
          saleDate,
        ]);
        expect(defaultPayBy(saleDate)).toBe(stored[0]?.d);
      }
    });
  });

  describe("recording a later payment", () => {
    it("takes one mode and moves the balance", async () => {
      const billId = await creditBill({});
      const { error } = await pay(billId, [{ payment_mode: "UPI", amount: 1500 }]);
      expect(error).toBeNull();
      expect(await row(billId)).toMatchObject({ paid: 7500, balance: 2500 });
    });

    it("takes one receipt in two modes, stored together", async () => {
      const billId = await creditBill({});
      const { error } = await pay(billId, [
        { payment_mode: "CASH", amount: 1000 },
        { payment_mode: "UPI", amount: 3000 },
      ]);
      expect(error).toBeNull();
      const receipts = await admin
        .from("credit_payments")
        .select("paid_on, credit_payment_lines(payment_mode, amount)")
        .eq("bill_id", billId);
      expect(receipts.data).toHaveLength(1);
      expect(receipts.data?.[0]?.paid_on).toBe(today());
      expect(receipts.data?.[0]?.credit_payment_lines).toHaveLength(2);
      expect(await row(billId)).toMatchObject({ paid: 10000, balance: 0 });
    });

    it("closes the Bill at zero balance and refuses another payment", async () => {
      const billId = await creditBill({});
      await pay(billId, [{ payment_mode: "CASH", amount: 4000 }]);
      expect((await row(billId)).balance).toBe(0);
      const again = await pay(billId, [{ payment_mode: "CASH", amount: 1 }]);
      expect(expectError(again).message).toBe("Nothing is owed on this bill");
    });

    it("refuses more than the balance and names it", async () => {
      const billId = await creditBill({});
      const over = await pay(billId, [{ payment_mode: "CASH", amount: 5000 }]);
      expect(expectError(over).message).toBe("₹5000 is more than the balance of ₹4000");
      const split = await pay(billId, [
        { payment_mode: "CASH", amount: 3000 },
        { payment_mode: "UPI", amount: 1500 },
      ]);
      expect(expectError(split).message).toBe("₹4500 is more than the balance of ₹4000");
      expect(await receiptIds(billId)).toEqual([]);
    });

    it("refuses a date in the future or before the sale", async () => {
      const billId = await creditBill({ saleDate: daysAgo(5) });
      const future = await pay(billId, [{ payment_mode: "CASH", amount: 100 }], daysAgo(-1));
      expect(expectError(future).message).toBe("Payment date cannot be in the future");
      const early = await pay(billId, [{ payment_mode: "CASH", amount: 100 }], daysAgo(6));
      expect(expectError(early).message).toBe("Payment date cannot be before the sale date");
      expect((await pay(billId, [{ payment_mode: "CASH", amount: 100 }], daysAgo(5))).error).toBeNull();
    });

    it("refuses an empty receipt, a zero amount, a repeated mode and an unknown mode", async () => {
      const billId = await creditBill({});
      const refusals: readonly { readonly paid: Json; readonly message: string }[] = [
        { paid: [], message: "Pick at least one payment mode" },
        { paid: [{ payment_mode: "CASH", amount: 0 }], message: "Each payment must be more than zero" },
        { paid: [{ payment_mode: "CASH" }], message: "Enter an amount for each payment mode" },
        {
          paid: [
            { payment_mode: "CASH", amount: 100 },
            { payment_mode: "CASH", amount: 100 },
          ],
          message: "Each payment mode can appear only once on a bill",
        },
        { paid: [{ payment_mode: "CHEQUE", amount: 100 }], message: "Payment mode must be Cash, UPI or Bank Transfer" },
      ];
      for (const { paid, message } of refusals) {
        const { error } = await operator.rpc("record_credit_payment", {
          p_bill_id: billId,
          p_paid_on: today(),
          p_payments: paid,
        });
        expect(expectError({ error }).message).toBe(message);
      }
    });

    it("refuses a bill that was not sold on credit and an unknown bill", async () => {
      const plain = await plainBill();
      expect(expectError(await pay(plain, [{ payment_mode: "CASH", amount: 1 }])).message).toBe(
        "This bill was not sold on credit",
      );
      expect(expectError(await pay(NO_BILL, [{ payment_mode: "CASH", amount: 1 }])).message).toBe("Unknown bill");
    });

    it("refuses someone who is not a Team Member", async () => {
      const billId = await creditBill({});
      const refused = await pay(billId, [{ payment_mode: "CASH", amount: 100 }], today(), stranger);
      expect(expectError(refused).message).toBe("Not a team member");
    });
  });

  describe("access", () => {
    it("lets members read credit and nobody write it directly", async () => {
      const billId = await creditBill({});
      await pay(billId, [{ payment_mode: "CASH", amount: 100 }]);
      expect(await row(billId)).toMatchObject({ paid: 6100 });
      expect((await stranger.from("v_credit").select("*")).data ?? []).toEqual([]);
      expect((await stranger.from("credit_payments").select("*")).data ?? []).toEqual([]);
      expect((await stranger.from("credit_promises").select("*")).data ?? []).toEqual([]);
      expectError(await operator.from("credit_payments").insert({ bill_id: billId, paid_on: today() }));
      expectError(await operator.from("credit_promises").insert({ bill_id: billId, pay_by: today() }));
      expectError(
        await admin.from("credit_payment_lines").insert({ payment_id: NO_BILL, payment_mode: "CASH", amount: 1 }),
      );
      const flip = await admin.from("bills").update({ on_credit: false }).eq("id", billId).select();
      expect(flip.data ?? []).toEqual([]);
      expect((await row(billId)).paid).toBe(6100);
    });
  });

  describe("correcting a later payment", () => {
    let billId: string;
    let receiptId: string;

    beforeEach(async () => {
      billId = await creditBill({ saleDate: daysAgo(5) });
      await pay(
        billId,
        [
          { payment_mode: "CASH", amount: 1000 },
          { payment_mode: "UPI", amount: 3000 },
        ],
        daysAgo(1),
      );
      receiptId = (await receiptIds(billId))[0] ?? "";
    });

    function edit(who: Db, paid: readonly BillPayment[], paidOn: string = daysAgo(1)) {
      return who.rpc("correct_credit_payment", { p_payment_id: receiptId, p_paid_on: paidOn, p_payments: [...paid] });
    }

    it("lets only an Admin edit or delete it", async () => {
      expect(expectError(await edit(operator, [{ payment_mode: "CASH", amount: 100 }])).message).toBe(
        "Only an Admin can make corrections",
      );
      const del = await operator.rpc("delete_credit_payment", { p_payment_id: receiptId });
      expect(expectError(del).message).toBe("Only an Admin can make corrections");
      expect(await row(billId)).toMatchObject({ paid: 10000, balance: 0 });
    });

    it("edits the whole receipt: modes, amounts and date", async () => {
      const { error } = await edit(admin, [{ payment_mode: "BANK_TRANSFER", amount: 500 }], daysAgo(2));
      expect(error).toBeNull();
      expect(await row(billId)).toMatchObject({ paid: 6500, balance: 3500 });
      const stored = await admin
        .from("credit_payments")
        .select("paid_on, credit_payment_lines(payment_mode, amount)")
        .eq("id", receiptId)
        .single();
      expect(stored.data?.paid_on).toBe(daysAgo(2));
      expect(stored.data?.credit_payment_lines).toEqual([{ payment_mode: "BANK_TRANSFER", amount: 500 }]);
    });

    it("refuses an edit that passes the balance, a future date and one before the sale", async () => {
      const over = await edit(admin, [{ payment_mode: "CASH", amount: 4001 }]);
      expect(expectError(over).message).toBe("₹4001 is more than the balance of ₹4000");
      expect(expectError(await edit(admin, [{ payment_mode: "CASH", amount: 100 }], daysAgo(-1))).message).toBe(
        "Payment date cannot be in the future",
      );
      expect(expectError(await edit(admin, [{ payment_mode: "CASH", amount: 100 }], daysAgo(6))).message).toBe(
        "Payment date cannot be before the sale date",
      );
      expect(await row(billId)).toMatchObject({ paid: 10000 });
    });

    it("deletes the whole receipt and the balance comes back", async () => {
      const { error } = await admin.rpc("delete_credit_payment", { p_payment_id: receiptId });
      expect(error).toBeNull();
      expect(await row(billId)).toMatchObject({ paid: 6000, balance: 4000 });
      expect(await sql(`select 1 from public.credit_payment_lines`)).toEqual([]);
    });

    it("refuses an unknown payment", async () => {
      const del = await admin.rpc("delete_credit_payment", { p_payment_id: NO_BILL });
      expect(expectError(del).message).toBe("Unknown payment");
    });
  });

  describe("correcting the Bill itself", () => {
    function correctTotal(saleId: string, quantity: number, payments?: readonly BillPayment[]) {
      return admin.rpc("correct_sale", {
        p_sale_id: saleId,
        p_batch_id: batch,
        p_customer_id: customerId,
        p_sale_date: daysAgo(5),
        p_quantity: quantity,
        p_sale_rate: 2000,
        p_payments: payments ? [...payments] : undefined,
      });
    }

    async function saleId(): Promise<string> {
      return (await sql<{ id: string }>(`select id from public.sales limit 1`))[0]?.id ?? "";
    }

    it("keeps the payments and moves the balance when the total goes up or down", async () => {
      const billId = await creditBill({});
      expect((await correctTotal(await saleId(), 4)).error).toBeNull();
      expect(await row(billId)).toMatchObject({ total: 8000, paid: 6000, balance: 2000 });
      expect((await correctTotal(await saleId(), 7)).error).toBeNull();
      expect(await row(billId)).toMatchObject({ total: 14000, paid: 6000, balance: 8000 });
      const stored = await admin.from("bill_payments").select("amount").eq("bill_id", billId);
      expect(stored.data).toEqual([{ amount: 6000 }]);
    });

    it("refuses a total below what was already received and names the amount", async () => {
      const billId = await creditBill({});
      await pay(billId, [{ payment_mode: "UPI", amount: 2000 }]);
      const refused = await correctTotal(await saleId(), 3);
      expect(expectError(refused).message).toBe("₹8000 is already paid but the bill total is now ₹6000");
      expect(await row(billId)).toMatchObject({ total: 10000, paid: 8000 });
    });

    it("refuses deleting a line that would take the total below what was received", async () => {
      const recorded = await recordBill(operator, {
        customerId,
        saleDate: daysAgo(5),
        payments: [{ payment_mode: "CASH", amount: 7000 }],
        onCredit: true,
        lines: [
          { batchId: batch, quantity: 5, saleRate: 2000 },
          { batchId: batch, quantity: 3, saleRate: 1000 },
        ],
      });
      expect(recorded.error).toBeNull();
      const sales = await sql<{ id: string }>(`select id from public.sales order by quantity desc`);
      const del = await admin.rpc("delete_sale", { p_sale_id: sales[0]?.id ?? "" });
      expect(expectError(del).message).toBe("₹7000 is already paid but the bill total is now ₹3000");
      const small = await admin.rpc("delete_sale", { p_sale_id: sales[1]?.id ?? "" });
      expect(small.error).toBeNull();
    });

    it("refuses a split edit on a credit Bill from the sale dialog", async () => {
      await creditBill({});
      const refused = await correctTotal(await saleId(), 5, [{ payment_mode: "CASH", amount: 10000 }]);
      expect(expectError(refused).message).toBe("Payments on a credit bill are changed on the Credit page");
    });

    it("deletes the whole Bill with its promises and later payments", async () => {
      const billId = await creditBill({});
      await pay(billId, [{ payment_mode: "UPI", amount: 100 }]);
      const { error } = await admin.rpc("delete_bill", { p_bill_id: billId });
      expect(error).toBeNull();
      for (const table of ["credit_promises", "credit_payments", "credit_payment_lines", "bill_payments"]) {
        expect(await sql(`select 1 from public.${table}`)).toEqual([]);
      }
    });
  });

  describe("extending the pay-by date", () => {
    it("adds a row, keeps the original, and counts the extensions", async () => {
      const billId = await creditBill({ saleDate: daysAgo(5), payBy: daysAgo(-3) });
      expect(await row(billId)).toMatchObject({ original_pay_by: daysAgo(-3), pay_by: daysAgo(-3), extensions: 0 });
      expect((await operator.rpc("extend_pay_by", { p_bill_id: billId, p_pay_by: daysAgo(-6) })).error).toBeNull();
      expect((await operator.rpc("extend_pay_by", { p_bill_id: billId, p_pay_by: daysAgo(-9) })).error).toBeNull();
      expect(await row(billId)).toMatchObject({ original_pay_by: daysAgo(-3), pay_by: daysAgo(-9), extensions: 2 });
      const history = await admin.from("credit_promises").select("pay_by").eq("bill_id", billId).order("id");
      expect(history.data?.map((r) => r.pay_by)).toEqual([daysAgo(-3), daysAgo(-6), daysAgo(-9)]);
    });

    it("reports days left, counting down to zero and then negative once late", async () => {
      const soon = await creditBill({ payBy: daysAgo(-2) });
      const dueToday = await creditBill({ payBy: today() });
      const late = await creditBill({ saleDate: daysAgo(10), payBy: daysAgo(3) });
      expect((await row(soon)).days_left).toBe(2);
      expect((await row(dueToday)).days_left).toBe(0);
      expect((await row(late)).days_left).toBe(-3);
    });

    it("counts days late from the latest promised date", async () => {
      const billId = await creditBill({ saleDate: daysAgo(10), payBy: daysAgo(5) });
      expect((await row(billId)).days_left).toBe(-5);
      await operator.rpc("extend_pay_by", { p_bill_id: billId, p_pay_by: daysAgo(-1) });
      expect((await row(billId)).days_left).toBe(1);
    });

    it("refuses a date that is not after the current one, in the past, over a year away, or on a closed or plain bill", async () => {
      const extend = (billId: string, date: string) =>
        operator.rpc("extend_pay_by", { p_bill_id: billId, p_pay_by: date });
      const billId = await creditBill({ saleDate: daysAgo(5), payBy: daysAgo(-3) });
      expect(expectError(await extend(billId, daysAgo(-3))).message).toBe(
        "The new pay-by date must be after the current pay-by date",
      );
      expect(expectError(await extend(billId, daysAgo(-400))).message).toBe(
        "The pay-by date can be at most a year away",
      );
      const late = await creditBill({ saleDate: daysAgo(10), payBy: daysAgo(5) });
      expect(expectError(await extend(late, daysAgo(2))).message).toBe("The pay-by date cannot be in the past");
      await pay(billId, [{ payment_mode: "CASH", amount: 4000 }]);
      expect(expectError(await extend(billId, daysAgo(-8))).message).toBe("Nothing is owed on this bill");
      expect(expectError(await extend(await plainBill(), daysAgo(-8))).message).toBe(
        "This bill was not sold on credit",
      );
    });
  });

  describe("Customers", () => {
    it("shows what each Customer owes and how late, ignoring settled Bills", async () => {
      const lateBill = await creditBill({ saleDate: daysAgo(10), payBy: daysAgo(3) });
      await creditBill({ paid: [], payBy: daysAgo(-5) });
      const settled = await creditBill({ payBy: daysAgo(-5) });
      await pay(settled, [{ payment_mode: "CASH", amount: 4000 }]);
      const other = await createCustomer(operator, { name: "Er. Selvam" });
      const customers = await admin.from("v_customers").select("id, owed, credit_days_left");
      const found = Object.fromEntries((customers.data ?? []).map((c) => [c.id, c]));
      expect(found[customerId]).toMatchObject({ owed: 14000, credit_days_left: -3 });
      expect(found[other]).toMatchObject({ owed: 0, credit_days_left: null });
      expect((await row(lateBill)).customer_name).toBe("Murugan Constructions");
    });
  });

  describe("Money received", () => {
    it("counts a later payment on the day it was received, in its own mode", async () => {
      const billId = await creditBill({ saleDate: daysAgo(5) });
      await pay(
        billId,
        [
          { payment_mode: "UPI", amount: 1000 },
          { payment_mode: "CASH", amount: 500 },
        ],
        daysAgo(1),
      );
      const { data, error } = await admin.rpc("received_by_period", {
        p_range: "custom",
        p_from: daysAgo(6),
        p_to: today(),
      });
      expect(error).toBeNull();
      const byDay = Object.fromEntries((data ?? []).map((r) => [r.period_start, r]));
      expect(byDay[daysAgo(5)]).toMatchObject({ cash: 6000, upi: 0, bank_transfer: 0, total: 6000 });
      expect(byDay[daysAgo(1)]).toMatchObject({ cash: 500, upi: 1000, bank_transfer: 0, total: 1500 });
      expect(byDay[daysAgo(3)]).toMatchObject({ total: 0 });
    });
  });

  describe("Margin table", () => {
    async function table() {
      const { data, error } = await admin.rpc("payments_by_mode", {
        p_range: "custom",
        p_from: daysAgo(6),
        p_to: today(),
      });
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.payment_mode, r]));
    }

    it("shows the unpaid part in its own row so the total equals Margin", async () => {
      await creditBill({ saleDate: daysAgo(5) });
      const rows = await table();
      expect(rows.CASH).toMatchObject({ collected: 6000, margin: 1800 });
      expect(rows.UNPAID).toMatchObject({ collected: 4000, margin: 1200 });
      const all = Object.values(rows);
      expect(total(all, "collected")).toBe(10000);
      expect(total(all, "margin")).toBe(3000);
    });

    it("counts a later payment under its mode on the sale date and empties the unpaid row", async () => {
      const billId = await creditBill({ saleDate: daysAgo(5) });
      await pay(billId, [{ payment_mode: "UPI", amount: 4000 }], today());
      const rows = await table();
      expect(rows.UPI).toMatchObject({ collected: 4000, margin: 1200 });
      expect(rows.CASH).toMatchObject({ collected: 6000, margin: 1800 });
      expect(rows.UNPAID).toMatchObject({ collected: 0, margin: 0 });
    });

    it("keeps the shares exact when the payments do not divide the Margin evenly", async () => {
      const billId = await creditBill({
        saleDate: daysAgo(5),
        paid: [
          { payment_mode: "CASH", amount: 3333 },
          { payment_mode: "UPI", amount: 1 },
        ],
      });
      await pay(billId, [{ payment_mode: "BANK_TRANSFER", amount: 1234 }], daysAgo(2));
      const rows = await table();
      const all = Object.values(rows);
      expect(total(all, "collected")).toBe(10000);
      expect(total(all, "margin")).toBe(3000);
      expect(rows.UNPAID?.collected).toBe(5432);
    });

    it("has an empty unpaid row when nothing is on credit", async () => {
      await recordBill(operator, { customerId, lines: [{ batchId: batch, quantity: 5, saleRate: 2000 }] });
      const rows = await table();
      expect(rows.UNPAID).toMatchObject({ collected: 0, margin: 0 });
      expect(rows.CASH).toMatchObject({ collected: 10000, margin: 3000 });
    });
  });
});
