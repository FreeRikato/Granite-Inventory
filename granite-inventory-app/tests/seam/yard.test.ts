import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createProduct, createSupplier, daysAgo } from "./fixtures";

describe("yard: v_yard_batches", () => {
  let operator: Db;
  let productId: string;
  let supplierId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
  });

  it("bands change exactly at the thresholds and follow settings", async () => {
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(89), variantName: "A" });
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(90), variantName: "B" });
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(179), variantName: "C" });
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(180), variantName: "D" });
    const { data } = await operator.from("v_yard_batches").select("variant_name, age_days, ageing_band").order("variant_name");
    expect(data?.map((r) => [r.variant_name, r.age_days, r.ageing_band])).toEqual([
      ["A", 89, "FRESH"], ["B", 90, "AGEING"], ["C", 179, "AGEING"], ["D", 180, "STALE"],
    ]);

    await sql(`update public.settings set ageing_after_days = 30, stale_after_days = 100`);
    const after = await operator.from("v_yard_batches").select("variant_name, ageing_band").order("variant_name");
    expect(after.data?.map((r) => r.ageing_band)).toEqual(["AGEING", "AGEING", "STALE", "STALE"]);
  });

  it("clamp gap is the days since the previous batch of the same stock line only", async () => {
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(10) });
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(7) });
    await createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(1), length: 5, breadth: 3, thickness: 20 });
    const { data } = await operator
      .from("v_yard_batches")
      .select("purchase_date, days_since_previous, length_ft")
      .order("purchase_date");
    expect(data?.map((r) => r.days_since_previous)).toEqual([null, 3, null]);
  });

  it("sold out is derived from available", async () => {
    const { data: batch } = await createBatch(operator, { productId, supplierId, units: 2 });
    await sql(`update public.batches set units_sold = 2 where id = $1`, [batch?.id]);
    const { data } = await operator.from("v_yard_batches").select("sold_out, available").single();
    expect(data).toEqual({ sold_out: true, available: 0 });
  });
});
