import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanPgMessage } from "@/lib/action-result";
import { batchSchema } from "@/lib/schemas/batch";
import { billLineSchema, billSchema, saleSchema } from "@/lib/schemas/sale";
import { billRpcArgs } from "@/lib/rpc-args";
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
    };
    expect(batchSchema.safeParse(batch).success).toBe(true);
    for (const override of [
      { lengthFt: 1000 },
      { breadthFt: 1000 },
      { thicknessMm: 2_147_483_648 },
      { initialUnits: 2_147_483_648 },
      { unitPurchasePrice: 1e10 },
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
      "Unit Quantity must be greater than zero",
    );
    expect(quantity.error?.issues.find((i) => i.path[0] === "quantity")?.message).toBe(
      "Sale quantity must be greater than zero",
    );
  });

  it("an order is refused without lines, and each line keeps the sale field sentences", () => {
    const line = {
      batchId: "00000000-0000-4000-8000-000000000003",
      quantity: 2,
      salePrice: 1650,
      hasStickering: false,
    };
    const order = {
      customerId: "00000000-0000-4000-8000-000000000004",
      saleDate: today(),
      paymentMode: "CASH",
    };

    const empty = billSchema.safeParse({ ...order, lines: [] });
    expect(empty.error?.issues[0]?.message).toBe("Add at least one line to the order");
    expect(billSchema.safeParse({ ...order, lines: [line] }).success).toBe(true);
    const zero = billSchema.safeParse({ ...order, lines: [line, { ...line, quantity: 0 }] });
    expect(zero.error?.issues[0]?.message).toBe("Sale quantity must be greater than zero");
    const negative = billSchema.safeParse({ ...order, lines: [{ ...line, salePrice: -1 }] });
    expect(negative.error?.issues[0]?.message).toBe("Stone Sale Price cannot be negative");
  });

  it("a blank Stone Sale Price is refused, not read as zero", () => {
    const line = { batchId: "00000000-0000-4000-8000-000000000003", quantity: 2, hasStickering: false };

    for (const blank of ["", "   ", undefined]) {
      const parsed = billLineSchema.safeParse({ ...line, salePrice: blank });
      expect(parsed.error?.issues[0]?.message, JSON.stringify(blank)).toBe("Stone Sale Price is required");
    }
    expect(billLineSchema.safeParse({ ...line, salePrice: "0" }).success).toBe(true);
    expect(billLineSchema.safeParse({ ...line, salePrice: 0 }).success).toBe(true);
  });

  it("the record_bill arguments carry stickering only on lines that have it", () => {
    const parsed = billSchema.parse({
      customerId: "00000000-0000-4000-8000-000000000004",
      saleDate: today(),
      paymentMode: "UPI",
      lines: [
        {
          batchId: "00000000-0000-4000-8000-000000000003",
          quantity: 4,
          salePrice: 2600,
          hasStickering: false,
          stickeringCost: 100,
          stickeringPrice: 250,
        },
        {
          batchId: "00000000-0000-4000-8000-000000000005",
          quantity: 5,
          salePrice: 1650,
          hasStickering: true,
          stickeringCost: 100,
          stickeringPrice: 250,
        },
      ],
    });

    expect(billRpcArgs(parsed).p_lines).toEqual([
      {
        batch_id: "00000000-0000-4000-8000-000000000003",
        quantity: 4,
        sale_price: 2600,
        has_stickering: false,
        stickering_cost: 0,
        stickering_price: 0,
      },
      {
        batch_id: "00000000-0000-4000-8000-000000000005",
        quantity: 5,
        sale_price: 1650,
        has_stickering: true,
        stickering_cost: 100,
        stickering_price: 250,
      },
    ]);
  });

  it("every negative amount is refused by the field's label", () => {
    const batch = batchSchema.safeParse({ unitPurchasePrice: -1 });
    const sale = saleSchema.safeParse({ salePrice: -1, stickeringCost: -1, stickeringPrice: -1 });
    const messages = (error: { issues: { path: PropertyKey[]; message: string }[] } | undefined, key: string) =>
      error?.issues.find((i) => i.path[0] === key)?.message;

    expect(messages(batch.error, "unitPurchasePrice")).toBe("Unit Purchase Price cannot be negative");
    expect(messages(sale.error, "salePrice")).toBe("Stone Sale Price cannot be negative");
    expect(messages(sale.error, "stickeringCost")).toBe("Stickering Cost cannot be negative");
    expect(messages(sale.error, "stickeringPrice")).toBe("Stickering Price cannot be negative");
  });
});
