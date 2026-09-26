import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanPgMessage } from "@/lib/action-result";
import { batchSchema } from "@/lib/schemas/batch";
import { saleSchema } from "@/lib/schemas/sale";
import { expectError, ensureTestUsers, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createProduct, today } from "./fixtures";

describe("API observations: readable refusals", () => {
  let operator: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
  });

  it("preview_batch_code refuses an unknown product and a missing date instead of returning null", async () => {
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });

    const unknown = await operator.rpc("preview_batch_code", {
      p_product_id: "00000000-0000-0000-0000-000000000000",
      p_date: today(),
    });
    expect(expectError(unknown).message).toBe("Unknown product");

    await expect(sql("select public.preview_batch_code($1, null)", [productId])).rejects.toThrow(
      "Purchase date is required",
    );

    const ok = await operator.rpc("preview_batch_code", { p_product_id: productId, p_date: today() });
    expect(ok.data).toMatch(/^BP-\d{2}[A-Z]{3}\d{2}-01$/);
  });

  it("refuses a second Walk-in Customer with a business-rule message", async () => {
    const result = await operator
      .from("customers")
      .insert({ name: "Another Walk-in", customer_type: "RETAIL", is_walk_in: true });

    const error = expectError(result);
    expect(error.message).toBe("Only one Walk-in Customer is allowed");
    expect(error.message).not.toContain("customers_one_walk_in");
  });

  it("maps a Postgres number overflow to a readable message", () => {
    expect(cleanPgMessage('value "2147483648" is out of range for type integer')).toBe("Number is too large");
    expect(cleanPgMessage("numeric field overflow")).toBe("Number is too large");
  });

  it("the batch and sale forms refuse numbers the columns cannot hold, before any write", () => {
    const batch = {
      productId: "00000000-0000-4000-8000-000000000001",
      variantName: "Grade 1",
      supplierId: "00000000-0000-4000-8000-000000000002",
      purchaseDate: today(),
      slot: "4FT",
      memorial: false,
      lengthFt: 4,
      breadthFt: 2,
      thicknessMm: 16,
      initialUnits: 5,
      unitPurchasePrice: 1000,
      freightCost: 0,
    };
    expect(batchSchema.safeParse(batch).success).toBe(true);
    for (const override of [
      { lengthFt: 1000 },
      { breadthFt: 1000 },
      { thicknessMm: 2_147_483_648 },
      { initialUnits: 2_147_483_648 },
      { unitPurchasePrice: 1e10 },
      { freightCost: 1e10 },
    ]) {
      expect(batchSchema.safeParse({ ...batch, ...override }).success, JSON.stringify(override)).toBe(false);
    }

    const sale = {
      batchId: "00000000-0000-4000-8000-000000000003",
      customerId: "00000000-0000-4000-8000-000000000004",
      saleDate: today(),
      quantity: 1,
      salePrice: 1000,
      paymentMode: "CASH",
      hasStickering: false,
    };
    expect(saleSchema.safeParse(sale).success).toBe(true);
    expect(saleSchema.safeParse({ ...sale, quantity: 2_147_483_648 }).success).toBe(false);
    expect(saleSchema.safeParse({ ...sale, salePrice: 1e10 }).success).toBe(false);
  });

  it("the forms and the API use the same sentence for a zero quantity", () => {
    const units = batchSchema.safeParse({ initialUnits: 0 });
    const quantity = saleSchema.safeParse({ quantity: 0 });

    expect(units.error?.issues.find((i) => i.path[0] === "initialUnits")?.message).toBe(
      "Initial units must be greater than zero",
    );
    expect(quantity.error?.issues.find((i) => i.path[0] === "quantity")?.message).toBe(
      "Sale quantity must be greater than zero",
    );
  });
});
