import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, recordSale, today } from "./fixtures";

describe("corrections: correct_batch, delete_batch, correct_sale, delete_sale", () => {
  let admin: Db;
  let operator: Db;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  let a: string;
  let b: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan" });
    a = (await createBatch(operator, { productId, supplierId, units: 15, unitPrice: 1000 })).data?.id ?? "";
    b = (await createBatch(operator, { productId, supplierId, units: 10, unitPrice: 2000 })).data?.id ?? "";
  });

  function correctBatch(db: Db, id: string, units: number, extra: Partial<{ price: number; variant: string }> = {}) {
    return db.rpc("correct_batch", {
      p_batch_id: id,
      p_product_id: productId,
      p_variant_name: extra.variant ?? "Grade 1",
      p_supplier_id: supplierId,
      p_purchase_date: today(),
      p_length_ft: 4,
      p_breadth_ft: 2,
      p_thickness_mm: 16,
      p_initial_units: units,
      p_unit_purchase_price: extra.price ?? 1000,
      p_freight_cost: 0,
    });
  }

  it("operators cannot correct or delete anything", async () => {
    expect(expectError(await correctBatch(operator, a, 20)).message).toMatch(/Only an Admin/);
    expect(expectError(await operator.rpc("delete_batch", { p_batch_id: a })).message).toMatch(/Only an Admin/);
    const sale = await recordSale(operator, { batchId: a, customerId, quantity: 2 });
    expect(expectError(await operator.rpc("delete_sale", { p_sale_id: sale.data?.id ?? "" })).message).toMatch(/Only an Admin/);
  });

  it("batch edits keep the code, recompute landed cost, and refuse going below units sold", async () => {
    await recordSale(operator, { batchId: a, customerId, quantity: 8 });
    const before = await admin.from("batches").select("batch_code").eq("id", a).single();
    const ok = await correctBatch(admin, a, 10, { price: 1200, variant: "Grade 2" });
    expect(ok.error).toBeNull();
    expect(ok.data?.batch_code).toBe(before.data?.batch_code);
    expect(ok.data?.landed_cost).toBe(1200);
    expect(ok.data?.updated_by).toBe("admin@test.local");
    const view = await admin.from("v_batches").select("available, variant_name").eq("id", a).single();
    expect(view.data).toEqual({ available: 2, variant_name: "Grade 2" });

    const tooFew = await correctBatch(admin, a, 5);
    expect(expectError(tooFew).message).toMatch(/already has 8 sold/);

    // The earlier sale keeps the landed cost it was recorded at.
    const sale = await admin.from("v_sales").select("landed_cost").single();
    expect(sale.data?.landed_cost).toBe(1000);
  });

  it("batch delete is refused while sales exist and works once they are gone", async () => {
    const sale = await recordSale(operator, { batchId: a, customerId, quantity: 1 });
    expect(expectError(await admin.rpc("delete_batch", { p_batch_id: a })).message).toMatch(/has 1 sale/);
    await admin.rpc("delete_sale", { p_sale_id: sale.data?.id ?? "" });
    const gone = await admin.rpc("delete_batch", { p_batch_id: a });
    expect(gone.error).toBeNull();
    expect((await admin.from("batches").select("id").eq("id", a)).data).toEqual([]);
  });

  it("moving a sale between batches rebalances both and re-snapshots landed cost", async () => {
    const sale = await recordSale(operator, { batchId: a, customerId, quantity: 5, salePrice: 1500 });
    const moved = await admin.rpc("correct_sale", {
      p_sale_id: sale.data?.id ?? "",
      p_batch_id: b,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 3,
      p_sale_price: 2500,
      p_payment_mode: "UPI",
      p_has_stickering: true,
      p_stickering_cost: 100,
      p_stickering_price: 300,
    });
    expect(moved.error).toBeNull();
    expect(moved.data?.landed_cost).toBe(2000);
    const batches = await admin.from("v_batches").select("id, available").in("id", [a, b]);
    expect(Object.fromEntries((batches.data ?? []).map((r) => [r.id, r.available]))).toEqual({ [a]: 15, [b]: 7 });

    const sameBatch = await admin.rpc("correct_sale", {
      p_sale_id: sale.data?.id ?? "",
      p_batch_id: b,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 10,
      p_sale_price: 2500,
      p_payment_mode: "CASH",
    });
    expect(sameBatch.error).toBeNull();
    const full = await admin.from("v_batches").select("available").eq("id", b).single();
    expect(full.data?.available).toBe(0);

    const tooMany = await admin.rpc("correct_sale", {
      p_sale_id: sale.data?.id ?? "",
      p_batch_id: b,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 11,
      p_sale_price: 2500,
      p_payment_mode: "CASH",
    });
    expect(expectError(tooMany).message).toMatch(/Only 10 available/);
    const unchanged = await admin.from("v_batches").select("available").eq("id", b).single();
    expect(unchanged.data?.available).toBe(0);
  });

  it("deleting a sale returns its pieces", async () => {
    const sale = await recordSale(operator, { batchId: a, customerId, quantity: 4 });
    const del = await admin.rpc("delete_sale", { p_sale_id: sale.data?.id ?? "" });
    expect(del.error).toBeNull();
    const view = await admin.from("v_batches").select("available").eq("id", a).single();
    expect(view.data?.available).toBe(15);
    expect((await admin.from("sales").select("id")).data).toEqual([]);
  });
});
