import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expectError, ensureTestUsers, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordSale } from "./fixtures";

describe("API hardening: readable validation and access errors", () => {
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
    customerId = await createCustomer(operator, { name: "Murugan Constructions" });
    const batch = await createBatch(operator, { productId, supplierId, units: 15 });
    batchId = batch.data?.id ?? "";
  });

  it("refuses a purchase date before the supported history with a readable message", async () => {
    const result = await createBatch(operator, { productId, supplierId, purchaseDate: "1999-12-31" });

    expect(expectError(result).message).toMatch(/purchase date.*2000-01-01/i);
  });

  it("accepts a batch on the supported history floor", async () => {
    const result = await createBatch(operator, { productId, supplierId, purchaseDate: "2000-01-01" });

    expect(result.error).toBeNull();
    expect(result.data?.purchase_date).toBe("2000-01-01");
  });

  it("refuses zero initial units before writing a batch", async () => {
    const before = await operator.from("batches").select("id");
    const result = await createBatch(operator, { productId, supplierId, units: 0 });

    expect(expectError(result).message).toMatch(/initial units.*greater than zero/i);
    const batches = await operator.from("batches").select("id");
    expect(batches.data).toHaveLength(before.data?.length ?? 0);
  });

  it("sanitizes record_sale constraint errors so they do not expose the caller email", async () => {
    const error = expectError(await recordSale(operator, { batchId, customerId, quantity: 0 }));
    const exposed = [error.message, error.details, error.hint]
      .filter((part): part is string => typeof part === "string")
      .join(" ");

    expect(error.message).toMatch(/sale quantity.*greater than zero/i);
    expect(exposed).not.toContain("operator@test.local");
  });

  it("returns a business-rule message for a blank customer name", async () => {
    const result = await operator.from("customers").insert({ name: "   ", customer_type: "REGULAR" });

    expect(expectError(result).message).toMatch(/customer name.*required/i);
  });

  it("returns a business-rule message for a malformed customer phone", async () => {
    const result = await operator
      .from("customers")
      .insert({ name: "Bad Phone", phone: "not-a-phone", customer_type: "REGULAR" });

    expect(expectError(result).message).toMatch(/customer phone.*6 to 20 digits/i);
  });

  it("returns a business-rule message for an unknown payment mode", async () => {
    const result = await operator.rpc("record_sale", {
      p_batch_id: batchId,
      p_customer_id: customerId,
      p_sale_date: daysAgo(0),
      p_quantity: 1,
      p_sale_price: 1650,
      p_payment_mode: "CHEQUE",
    });

    expect(expectError(result).message).toMatch(/payment mode.*cash.*upi.*bank transfer/i);
  });

  it("returns a business-rule message for a future sale date", async () => {
    const result = await recordSale(operator, { batchId, customerId, saleDate: daysAgo(-1) });

    expect(expectError(result).message).toMatch(/sale date.*future/i);
  });

  it("returns a business-rule message for negative freight", async () => {
    const result = await createBatch(operator, { productId, supplierId, freight: -1 });

    expect(expectError(result).message).toMatch(/freight cost.*zero or more/i);
  });

  it("returns a business-rule message for a negative unit purchase price", async () => {
    const result = await createBatch(operator, { productId, supplierId, unitPrice: -1 });

    expect(expectError(result).message).toMatch(/unit purchase price.*zero or more/i);
  });

  it("returns a business-rule message for a negative sale price", async () => {
    const result = await recordSale(operator, { batchId, customerId, salePrice: -1 });

    expect(expectError(result).message).toMatch(/sale price.*zero or more/i);
  });

  it("returns a permission error when a non-member calls create_batch", async () => {
    const stranger = await signedInClient("stranger");
    const result = await createBatch(stranger, { productId, supplierId });

    expect(expectError(result).message).toMatch(/not a team member/i);
    expect(result.error?.message).not.toMatch(/unknown product/i);
  });
});
