import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { batchSchema } from "@/lib/schemas/batch";
import { batchRpcArgs } from "@/lib/rpc-args";
import { ensureTestUsers, resetDomainData, signedInClient, type Db } from "./harness";
import { createProduct, createSupplier, today } from "./fixtures";

describe("batch forms: freight is part of the Unit Purchase Price", () => {
  let admin: Db;
  let operator: Db;
  let productId: string;
  let supplierId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
  });

  function formPayload(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      variantName: "Grade 1",
      supplierId,
      purchaseDate: today(),
      slot: "4FT",
      stackNumber: "1",
      memorial: false,
      lengthFt: "4",
      breadthFt: "2",
      thicknessMm: "16",
      initialUnits: "10",
      unitPurchasePrice: "1000",
      ...overrides,
    };
  }

  function parse(payload: Record<string, unknown>) {
    const parsed = batchSchema.safeParse(payload);
    if (!parsed.success) throw parsed.error;
    return batchRpcArgs(parsed.data);
  }

  it("a new batch saved from the form has landed cost equal to the Unit Purchase Price and no freight", async () => {
    const { data, error } = await operator.rpc("create_batch", parse(formPayload()));
    expect(error).toBeNull();
    expect(data?.freight_cost).toBe(0);
    expect(data?.landed_cost).toBe(1000);
  });

  it("a payload that still carries freightCost is saved the same way", async () => {
    const { data, error } = await operator.rpc("create_batch", parse(formPayload({ freightCost: "500" })));
    expect(error).toBeNull();
    expect(data?.freight_cost).toBe(0);
    expect(data?.landed_cost).toBe(1000);
  });

  it("editing a batch from the form sets landed cost to the new price and keeps freight at 0", async () => {
    const created = await operator.rpc("create_batch", parse(formPayload()));
    const { data, error } = await admin.rpc("correct_batch", {
      p_batch_id: created.data?.id ?? "",
      ...parse(formPayload({ unitPurchasePrice: "1200", freightCost: "500" })),
    });
    expect(error).toBeNull();
    expect(data?.landed_cost).toBe(1200);
    expect(data?.freight_cost).toBe(0);
  });
});
