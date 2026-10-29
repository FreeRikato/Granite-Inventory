import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordSale, today } from "./fixtures";

describe("sales: record_sale, v_sales, v_stock_lines", () => {
  let operator: Db;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  let batchId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, {
      name: "Murugan Constructions",
      phone: "+91 98765 43210",
      type: "CONTRACTOR",
    });
    const batch = await createBatch(operator, { productId, supplierId, units: 15, unitPrice: 175, freight: 750 });
    batchId = batch.data?.id ?? "";
  });

  it("records a sale, snapshots landed cost and decrements the batch", async () => {
    const { data, error } = await recordSale(operator, { batchId, customerId, quantity: 5, salePrice: 1650 });
    expect(error).toBeNull();
    expect(data?.landed_cost).toBe(1450);
    expect(data?.created_by).toBe("operator@test.local");
    const batch = await operator.from("v_batches").select("available, units_sold").eq("id", batchId).single();
    expect(batch.data).toEqual({ available: 10, units_sold: 5 });
  });

  it("computes margin with and without stickering", async () => {
    await recordSale(operator, {
      batchId,
      customerId,
      quantity: 5,
      salePrice: 1650,
      stickering: { cost: 100, price: 250 },
    });
    const { data } = await operator.from("v_sales").select("*").single();
    expect(data?.stone_total).toBe(8250);
    expect(data?.stickering_total).toBe(1250);
    expect(data?.revenue).toBe(9500);
    expect(data?.stone_margin).toBe(1000);
    expect(data?.stickering_margin).toBe(750);
    expect(data?.margin).toBe(1750);
    expect(data?.margin_pct).toBe(18.42);

    await recordSale(operator, { batchId, customerId, quantity: 1, salePrice: 1650, stickering: undefined });
    const plain = await operator
      .from("v_sales")
      .select("margin, margin_pct, stickering_total")
      .eq("has_stickering", false)
      .single();
    expect(plain.data).toEqual({ margin: 200, margin_pct: 12.12, stickering_total: 0 });
  });

  it("record_sale and correct_sale refuse a Misc Expense argument", async () => {
    const admin = await signedInClient("admin");
    const sale = await recordSale(operator, { batchId, customerId });
    const withMisc = {
      p_batch_id: batchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_price: 1650,
      p_payment_mode: "CASH",
      p_misc_expense: 300,
    };

    expect(expectError(await operator.rpc("record_sale", withMisc)).message).toMatch(/p_misc_expense/);
    expect(
      expectError(await admin.rpc("correct_sale", { ...withMisc, p_sale_id: sale.data?.id ?? "" })).message,
    ).toMatch(/p_misc_expense/);
  });

  it("v_sales has no misc_expense column", async () => {
    await recordSale(operator, { batchId, customerId });
    const { data } = await operator.from("v_sales").select("*").single();
    expect(Object.keys(data ?? {})).not.toContain("misc_expense");
  });

  it("a Sale stored with a Misc Expense before the change keeps its value, and new Sales store 0", async () => {
    await sql(
      `insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, misc_expense, payment_mode)
       values ($1, $2, $3, 1, 1650, 1450, 300, 'CASH')`,
      [today(), batchId, customerId],
    );
    await recordSale(operator, { batchId, customerId, quantity: 2 });
    const rows = await sql<{ quantity: number; misc_expense: string }>(
      `select quantity, misc_expense from public.sales order by quantity`,
    );
    expect(rows.map((r) => [r.quantity, Number(r.misc_expense)])).toEqual([
      [1, 300],
      [2, 0],
    ]);
  });

  it("refuses a NaN or infinite price and stickering amount with a readable sentence", async () => {
    const refusals = [
      { line: { sale_price: "NaN" }, message: "Sale price must be a number" },
      { line: { sale_price: "Infinity" }, message: "Sale price must be a number" },
      {
        line: { sale_price: 1650, has_stickering: true, stickering_cost: "NaN" },
        message: "Stickering cost must be a number",
      },
      {
        line: { sale_price: 1650, has_stickering: true, stickering_price: "Infinity" },
        message: "Stickering price must be a number",
      },
    ];

    for (const { line, message } of refusals) {
      const { error } = await operator.rpc("record_bill", {
        p_customer_id: customerId,
        p_sale_date: today(),
        p_payment_mode: "CASH",
        p_lines: [{ batch_id: batchId, quantity: 1, ...line }],
      });
      expect(expectError({ error }).message).toBe(message);
    }

    const stored = await sql<{ n: string }>(`select count(*) as n from public.sales`);
    expect(Number(stored[0]?.n)).toBe(0);
  });

  it("the shared sale check that record_sale and correct_sale call refuses NaN too", async () => {
    await expect(
      sql(`select private.validate_sale_input(current_date, 1, 'NaN'::numeric, 'CASH', false, 0, 0, null)`),
    ).rejects.toThrow("Sale price must be a number");
    await expect(
      sql(`select private.validate_sale_input(current_date, 1, 100, 'CASH', true, 0, 'NaN'::numeric, null)`),
    ).rejects.toThrow("Stickering price must be a number");
  });

  it("refuses overselling and leaves exactly one winner when two sales race for the last pieces", async () => {
    const over = await recordSale(operator, { batchId, customerId, quantity: 16 });
    expect(expectError(over).message).toMatch(/Only 15 available/);

    await recordSale(operator, { batchId, customerId, quantity: 13 });
    const [a, b] = await Promise.all([
      recordSale(operator, { batchId, customerId, quantity: 2 }),
      recordSale(operator, { batchId, customerId, quantity: 2 }),
    ]);
    expect([a.error, b.error].filter((e) => e === null)).toHaveLength(1);
    const batch = await operator.from("v_batches").select("available").eq("id", batchId).single();
    expect(batch.data?.available).toBe(0);
  });

  it("snapshot is immune to a later batch price edit", async () => {
    await recordSale(operator, { batchId, customerId, quantity: 1 });
    await sql(`update public.batches set unit_purchase_price = 9999 where id = $1`, [batchId]);
    const { data } = await operator.from("v_sales").select("landed_cost, margin").single();
    expect(data).toEqual({ landed_cost: 1450, margin: 200 });
  });

  it("stock lines group batches by product and size whatever their variant, oldest first for FIFO", async () => {
    await createBatch(operator, {
      productId,
      supplierId,
      units: 10,
      purchaseDate: daysAgo(30),
      variantName: "Standard",
    });
    await createBatch(operator, { productId, supplierId, units: 6, length: 5, breadth: 3, thickness: 20 });
    const { data } = await operator.from("v_stock_lines").select("*").order("length_ft");
    expect(data?.map((l) => [l.length_ft, l.available, l.batch_count])).toEqual([
      [4, 25, 2],
      [5, 6, 1],
    ]);

    const fifo = await operator
      .from("v_yard_batches")
      .select("purchase_date, available")
      .eq("product_id", data?.[0]?.product_id ?? "")
      .eq("length_ft", 4)
      .gt("available", 0)
      .order("purchase_date");
    expect(fifo.data?.map((b) => b.available)).toEqual([10, 15]);
  });

  it("phone is unique ignoring formatting, and the walk-in customer is protected", async () => {
    const dup = await operator.from("customers").insert({ name: "Someone", phone: "9876543210" });
    expect(expectError(dup).message).toMatch(/customers_phone_key/);
    const admin = await signedInClient("admin");
    const del = await admin.from("customers").delete().eq("is_walk_in", true).select();
    expectError(del);
  });

  it("anon and strangers cannot record sales", async () => {
    expectError(await recordSale(anonClient(), { batchId, customerId }));
    const stranger = await signedInClient("stranger");
    expect(expectError(await recordSale(stranger, { batchId, customerId })).message).toMatch(/Not a team member/);
    expect((await stranger.from("v_sales").select("id")).data).toEqual([]);
  });
});
