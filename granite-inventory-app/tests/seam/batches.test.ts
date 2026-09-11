import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createProduct, createSupplier, daysAgo, today } from "./fixtures";

describe("batches: create_batch", () => {
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

  it("creates a batch with a generated code, default slot and landed cost without freight", async () => {
    const { data, error } = await createBatch(operator, { productId, supplierId, units: 15, unitPrice: 1400 });
    expect(error).toBeNull();
    const d = new Date();
    const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getUTCMonth()];
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yy = String(d.getUTCFullYear()).slice(-2);
    expect(data?.batch_code).toBe(`BP-${dd}${mon}${yy}-01`);
    expect(data?.slot).toBe("4FT");
    expect(data?.landed_cost).toBe(1400);
    expect(data?.units_sold).toBe(0);
    expect(data?.created_by).toBe("operator@test.local");
  });

  it("spreads freight over the pieces into landed cost, rounded to paise", async () => {
    const { data } = await createBatch(operator, { productId, supplierId, units: 16, unitPrice: 1400, freight: 750 });
    expect(data?.landed_cost).toBe(1446.88);
  });

  it("reuses an existing variant case-insensitively and never merges batches", async () => {
    await createBatch(operator, { productId, supplierId, variantName: "Grade 1" });
    await createBatch(operator, { productId, supplierId, variantName: "grade 1" });
    const variants = await operator.from("variants").select("id").eq("product_id", productId);
    expect(variants.data).toHaveLength(1);
    const batches = await operator.from("batches").select("batch_code").order("batch_code");
    expect(batches.data?.map((b) => b.batch_code.slice(-2))).toEqual(["01", "02"]);
  });

  it("sequence is per product per day and survives concurrent inserts", async () => {
    const other = await createProduct(operator, { name: "Jet Black", abbreviation: "JB" });
    const attempts = await Promise.all([
      createBatch(operator, { productId, supplierId }),
      createBatch(operator, { productId, supplierId }),
      createBatch(operator, { productId, supplierId }),
      createBatch(operator, { productId: other, supplierId }),
      createBatch(operator, { productId, supplierId, purchaseDate: daysAgo(1) }),
    ]);
    expect(attempts.map((a) => a.error?.message ?? null)).toEqual([null, null, null, null, null]);
    const codes = attempts.map((a) => a.data?.batch_code ?? "").sort();
    const bpToday = codes.filter((c) => c.startsWith("BP-") && c.includes(today().slice(8)));
    expect(new Set(codes).size).toBe(5);
    expect(bpToday.map((c) => c.slice(-2)).sort()).toEqual(["01", "02", "03"]);
    expect(codes.some((c) => c.startsWith("JB-") && c.endsWith("-01"))).toBe(true);
  });

  it("slot follows category and length but the operator may override it", async () => {
    const five = await createBatch(operator, { productId, supplierId, length: 5, breadth: 3, thickness: 20 });
    expect(five.data?.slot).toBe("5FT");
    const quarter = await createBatch(operator, { productId, supplierId, length: 4.25 });
    expect(quarter.data?.slot).toBe("4FT");
    const odd = await createBatch(operator, { productId, supplierId, length: 3, breadth: 2 });
    expect(odd.data?.slot).toBe("CUSTOM");
    const forced = await createBatch(operator, { productId, supplierId, slot: "CUSTOM" });
    expect(forced.data?.slot).toBe("CUSTOM");
  });

  it("memorial batches carry no size and land in the Doom slot; granite requires size", async () => {
    const doom = await createProduct(operator, { name: "Doom Stone", abbreviation: "DS", category: "MEMORIAL" });
    const ok = await createBatch(operator, { productId: doom, supplierId, variantName: "Std Cross", length: null });
    expect(ok.error).toBeNull();
    expect(ok.data?.slot).toBe("DOOM");
    expect(ok.data?.length_ft).toBeNull();

    const sized = await createBatch(operator, { productId: doom, supplierId, variantName: "Std Cross" });
    expect(expectError(sized).message).toMatch(/no size/i);

    const unsized = await createBatch(operator, { productId, supplierId, length: null });
    expect(expectError(unsized).message).toMatch(/size is required/i);
  });

  it("rejects future dates, zero units and negative prices", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expectError(await createBatch(operator, { productId, supplierId, purchaseDate: tomorrow }));
    expectError(await createBatch(operator, { productId, supplierId, units: 0 }));
    expectError(await createBatch(operator, { productId, supplierId, unitPrice: -1 }));
  });

  it("anon and strangers cannot create or read batches", async () => {
    await createBatch(operator, { productId, supplierId });
    const anon = anonClient();
    expectError(await createBatch(anon, { productId, supplierId }));
    expect((await anon.from("v_batches").select("id")).data).toEqual([]);
    const stranger = await signedInClient("stranger");
    expectError(await createBatch(stranger, { productId, supplierId }));
    expect((await stranger.from("v_batches").select("id")).data).toEqual([]);
  });

  it("v_batches resolves names and available units", async () => {
    await createBatch(operator, { productId, supplierId, units: 15 });
    const { data } = await operator.from("v_batches").select("*").single();
    expect(data?.product_name).toBe("Black Pearl");
    expect(data?.variant_name).toBe("Grade 1");
    expect(data?.supplier_name).toBe("Madurai Quarry");
    expect(data?.available).toBe(15);
  });
});
