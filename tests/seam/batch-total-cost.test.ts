import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createProduct, createSupplier } from "./fixtures";

describe("v_batches: total_cost", () => {
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

  async function costs(id: string) {
    const { data, error } = await operator.from("v_batches").select("landed_cost, total_cost").eq("id", id).single();
    expect(error).toBeNull();
    return data;
  }

  it("is the area times the pieces times the per sq ft price", async () => {
    const batch = await createBatch(operator, {
      productId,
      supplierId,
      length: 6,
      breadth: 2,
      units: 10,
      unitPrice: 100,
    });
    expect(await costs(batch.data?.id ?? "")).toEqual({ landed_cost: 1200, total_cost: 12000 });
  });

  it("is the pieces times the per piece price for Doom Stones", async () => {
    const memorialId = await createProduct(operator, { name: "Doom Stone", abbreviation: "DS", category: "MEMORIAL" });
    const batch = await createBatch(operator, {
      productId: memorialId,
      supplierId,
      length: null,
      units: 10,
      unitPrice: 1000,
    });
    expect(await costs(batch.data?.id ?? "")).toEqual({ landed_cost: 1000, total_cost: 10000 });
  });

  it("adds any freight still stored on the batch", async () => {
    const batch = await createBatch(operator, {
      productId,
      supplierId,
      length: 5,
      breadth: 2,
      units: 10,
      unitPrice: 100,
    });
    const id = batch.data?.id ?? "";
    await sql("update public.batches set freight_cost = 500 where id = $1", [id]);
    expect(await costs(id)).toEqual({ landed_cost: 1050, total_cost: 10500 });
  });

  it("stays on an archived batch", async () => {
    const batch = await createBatch(operator, {
      productId,
      supplierId,
      length: 5,
      breadth: 3,
      units: 15,
      unitPrice: 100,
    });
    const id = batch.data?.id ?? "";
    expect((await admin.rpc("archive_batch", { p_batch_id: id, p_archived: true })).error).toBeNull();
    expect((await costs(id))?.total_cost).toBe(22500);
  });

  it("refuses a per sq ft price that makes one piece cost too much", async () => {
    const batch = await createBatch(operator, {
      productId,
      supplierId,
      length: 100,
      breadth: 100,
      units: 1,
      unitPrice: 1e7,
    });
    expect(batch.error?.message).toBe("Landed Cost per piece is too large");
  });
});
