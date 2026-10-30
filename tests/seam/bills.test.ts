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
} from "./fixtures";

describe("bills: record_bill, v_sales.bill_id", () => {
  let operator: Db;
  let customerId: string;
  let blackBatchId: string;
  let pearlBatchId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    const black = await createProduct(operator, { name: "Absolute Black", abbreviation: "AB" });
    const pearl = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions", phone: "+91 98765 43210" });
    const blackBatch = await createBatch(operator, {
      productId: black,
      supplierId,
      units: 15,
      unitPrice: 175,
      freight: 750,
    });
    const pearlBatch = await createBatch(operator, {
      productId: pearl,
      supplierId,
      units: 20,
      unitPrice: 200,
      freight: 0,
    });
    blackBatchId = blackBatch.data?.id ?? "";
    pearlBatchId = pearlBatch.data?.id ?? "";
  });

  async function availableOf(batchId: string): Promise<number | null> {
    const { data } = await operator.from("v_batches").select("available").eq("id", batchId).single();
    return data?.available ?? null;
  }

  async function billCount(): Promise<number> {
    const rows = await sql<{ n: string }>(`select count(*) as n from public.bills`);
    return Number(rows[0]?.n);
  }

  async function saleCount(): Promise<number> {
    const rows = await sql<{ n: string }>(`select count(*) as n from public.sales`);
    return Number(rows[0]?.n);
  }

  it("creates one Bill and one Sale per line on different Batches", async () => {
    const { data, error } = await recordBill(operator, {
      customerId,
      saleDate: daysAgo(0),
      paymentMode: "UPI",
      lines: [
        { batchId: blackBatchId, quantity: 4, saleRate: 206.25 },
        { batchId: pearlBatchId, quantity: 5, saleRate: 112.5 },
      ],
    });
    expect(error).toBeNull();

    const bills = await sql<{ id: string; customer_id: string; sale_date: string; payment_mode: string }>(
      `select id, customer_id, to_char(sale_date, 'YYYY-MM-DD') as sale_date, payment_mode from public.bills`,
    );
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ customer_id: customerId, sale_date: today(), payment_mode: "UPI" });

    const sales = await operator.from("v_sales").select("*").order("quantity");
    expect(sales.data).toHaveLength(2);
    for (const sale of sales.data ?? []) {
      expect(sale.bill_id).toBe(bills[0]?.id);
      expect(sale.customer_id).toBe(customerId);
      expect(sale.sale_date).toBe(today());
      expect(sale.payment_mode).toBe("UPI");
    }
    const [black, pearl] = sales.data ?? [];
    expect(black).toMatchObject({ batch_id: blackBatchId, quantity: 4, landed_cost: 1450 });
    expect(pearl).toMatchObject({ batch_id: pearlBatchId, quantity: 5, landed_cost: 1600 });

    expect(await availableOf(blackBatchId)).toBe(11);
    expect(await availableOf(pearlBatchId)).toBe(15);

    expect(data).toMatchObject({
      bill: { id: bills[0]?.id },
      sales: [{ batch_id: blackBatchId }, { batch_id: pearlBatchId }],
    });
  });

  it("refuses the whole Bill when a later line asks for more than its Batch has", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [
        { batchId: blackBatchId, quantity: 4 },
        { batchId: pearlBatchId, quantity: 21 },
      ],
    });
    expect(expectError({ error }).message).toMatch(/^Only 20 available in batch BP-\d{2}[A-Z]{3}\d{2}-01$/);
    expect(await billCount()).toBe(0);
    expect(await saleCount()).toBe(0);
    expect(await availableOf(blackBatchId)).toBe(15);
  });

  it("sums two lines on one Batch against its available", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [
        { batchId: blackBatchId, quantity: 10 },
        { batchId: blackBatchId, quantity: 6, saleRate: 212.5 },
      ],
    });
    expect(expectError({ error }).message).toMatch(/^Only 5 available in batch /);
    expect(await billCount()).toBe(0);
    expect(await saleCount()).toBe(0);
    expect(await availableOf(blackBatchId)).toBe(15);
  });

  it("accepts two lines on one Batch that fit together", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [
        { batchId: blackBatchId, quantity: 10 },
        { batchId: blackBatchId, quantity: 5, saleRate: 212.5 },
      ],
    });
    expect(error).toBeNull();
    expect(await saleCount()).toBe(2);
    expect(await availableOf(blackBatchId)).toBe(0);
  });

  it("refuses the whole Bill when the Sale Date is before any line's Batch was bought", async () => {
    const supplierId = await createSupplier(operator, "Salem Quarry");
    const product = await createProduct(operator, { name: "Kashmir White", abbreviation: "KW" });
    const recent = await createBatch(operator, { productId: product, supplierId, units: 5, purchaseDate: daysAgo(2) });

    const { error } = await recordBill(operator, {
      customerId,
      saleDate: daysAgo(5),
      lines: [
        { batchId: blackBatchId, quantity: 1 },
        { batchId: recent.data?.id ?? "", quantity: 1 },
      ],
    });
    expect(expectError({ error }).message).toMatch(/^Sale date cannot be before the batch was bought/);
    expect(await billCount()).toBe(0);
    expect(await saleCount()).toBe(0);
  });

  it("refuses a future Sale Date with the same sentence as record_sale and saves nothing", async () => {
    const lines = [{ batchId: blackBatchId, quantity: 1 }];
    const bill = await recordBill(operator, { customerId, saleDate: daysAgo(-1), lines });
    const sale = await recordSale(operator, { batchId: blackBatchId, customerId, saleDate: daysAgo(-1) });

    expect(expectError(bill).message).toBe("Sale date cannot be in the future");
    expect(expectError(bill).message).toBe(expectError(sale).message);
    expect(await billCount()).toBe(0);
    expect(await saleCount()).toBe(0);
  });

  it("refuses a payment mode outside Cash, UPI and Bank Transfer with a readable sentence", async () => {
    const { error } = await operator.rpc("record_bill", {
      p_customer_id: customerId,
      p_sale_date: today(),
      p_payment_mode: "CHEQUE",
      p_lines: [{ batch_id: blackBatchId, quantity: 1, sale_rate: 206.25 }],
    });
    expect(expectError({ error }).message).toBe("Payment mode must be Cash, UPI or Bank Transfer");
    expect(await billCount()).toBe(0);
  });

  it("refuses a Bill with zero lines", async () => {
    const { error } = await recordBill(operator, { customerId, lines: [] });
    expect(expectError({ error }).message).toBe("A bill needs at least one line");
    expect(await billCount()).toBe(0);
  });

  it("refuses an unknown customer", async () => {
    const { error } = await recordBill(operator, {
      customerId: "00000000-0000-0000-0000-000000000000",
      lines: [{ batchId: blackBatchId, quantity: 1 }],
    });
    expect(expectError({ error }).message).toBe("Unknown customer");
    expect(await billCount()).toBe(0);
  });

  it("refuses the whole Bill when a line is on an archived Batch", async () => {
    const admin = await signedInClient("admin");
    expect((await admin.rpc("archive_batch", { p_batch_id: pearlBatchId, p_archived: true })).error).toBeNull();

    const { error } = await recordBill(operator, {
      customerId,
      lines: [
        { batchId: blackBatchId, quantity: 1 },
        { batchId: pearlBatchId, quantity: 1 },
      ],
    });
    expect(expectError({ error }).message).toMatch(/is archived; unarchive it to sell from it$/);
    expect(await billCount()).toBe(0);
    expect(await availableOf(blackBatchId)).toBe(15);
  });

  it("leaves bill_id null on a Sale from record_sale and sets it on a Sale from record_bill", async () => {
    await recordSale(operator, { batchId: blackBatchId, customerId, quantity: 1 });
    await recordBill(operator, { customerId, lines: [{ batchId: pearlBatchId, quantity: 2 }] });

    const single = await operator.from("v_sales").select("bill_id").eq("batch_id", blackBatchId).single();
    expect(single.data?.bill_id).toBeNull();
    const billed = await operator.from("v_sales").select("bill_id").eq("batch_id", pearlBatchId).single();
    expect(billed.data?.bill_id).toEqual(expect.any(String));
  });

  it("records a Bill for the Walk-in Customer", async () => {
    const walkIn = await operator.from("customers").select("id").eq("is_walk_in", true).single();
    const { error } = await recordBill(operator, {
      customerId: walkIn.data?.id ?? "",
      lines: [{ batchId: blackBatchId, quantity: 2 }],
    });
    expect(error).toBeNull();
    expect(await billCount()).toBe(1);
  });

  it("refuses an anon caller and a signed-in non-member, and shows them no Bills", async () => {
    await recordBill(operator, { customerId, lines: [{ batchId: blackBatchId, quantity: 1 }] });
    const input = { customerId, lines: [{ batchId: blackBatchId, quantity: 1 }] };

    const anon = anonClient();
    expectError(await recordBill(anon, input));
    expect((await anon.from("bills").select("id")).data).toEqual([]);

    const stranger = await signedInClient("stranger");
    expect(expectError(await recordBill(stranger, input)).message).toBe("Not a team member");
    expect((await stranger.from("bills").select("id")).data).toEqual([]);

    expect(await billCount()).toBe(1);
  });

  it("gives members no way to write a Bill directly", async () => {
    const insert = await operator
      .from("bills")
      .insert({ customer_id: customerId, sale_date: today(), payment_mode: "CASH" });
    expectError(insert);
    expect(await billCount()).toBe(0);
  });
});
