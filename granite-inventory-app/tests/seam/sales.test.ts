import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordSale } from "./fixtures";

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
    customerId = await createCustomer(operator, { name: "Murugan Constructions", phone: "+91 98765 43210", type: "CONTRACTOR" });
    const batch = await createBatch(operator, { productId, supplierId, units: 15, unitPrice: 1400, freight: 750 });
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

  it("computes margin with and without stickering, misc expense excluded", async () => {
    await recordSale(operator, { batchId, customerId, quantity: 5, salePrice: 1650, stickering: { cost: 100, price: 250 }, misc: 300 });
    const { data } = await operator.from("v_sales").select("*").single();
    expect(data?.stone_total).toBe(8250);
    expect(data?.stickering_total).toBe(1250);
    expect(data?.revenue).toBe(9500);
    expect(data?.stone_margin).toBe(1000);
    expect(data?.stickering_margin).toBe(750);
    expect(data?.margin).toBe(1750);
    expect(data?.margin_pct).toBe(18.42);
    expect(data?.misc_expense).toBe(300);

    await recordSale(operator, { batchId, customerId, quantity: 1, salePrice: 1650, stickering: undefined });
    const plain = await operator.from("v_sales").select("margin, margin_pct, stickering_total").eq("has_stickering", false).single();
    expect(plain.data).toEqual({ margin: 200, margin_pct: 12.12, stickering_total: 0 });
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

  it("stock lines group batches by product, variant and size, oldest first for FIFO", async () => {
    await createBatch(operator, { productId, supplierId, units: 10, purchaseDate: daysAgo(30) });
    await createBatch(operator, { productId, supplierId, units: 6, length: 5, breadth: 3, thickness: 20 });
    const { data } = await operator.from("v_stock_lines").select("*").order("length_ft");
    expect(data?.map((l) => [l.length_ft, l.available, l.batch_count])).toEqual([[4, 25, 2], [5, 6, 1]]);

    const fifo = await operator
      .from("v_yard_batches")
      .select("purchase_date, available")
      .eq("variant_id", data?.[0]?.variant_id ?? "")
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
