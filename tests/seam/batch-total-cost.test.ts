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

  async function totalCost(id: string) {
    const { data, error } = await operator.from("v_batches").select("total_cost").eq("id", id).single();
    expect(error).toBeNull();
    return data?.total_cost;
  }

  it("is the pieces times the unit purchase price", async () => {
    const batch = await createBatch(operator, { productId, supplierId, units: 10, unitPrice: 1000 });
    expect(await totalCost(batch.data?.id ?? "")).toBe(10000);
  });

  it("adds any freight still stored on the batch", async () => {
    const batch = await createBatch(operator, { productId, supplierId, units: 10, unitPrice: 1000 });
    const id = batch.data?.id ?? "";
    await sql("update public.batches set freight_cost = 500 where id = $1", [id]);
    expect(await totalCost(id)).toBe(10500);
  });

  it("stays on an archived batch", async () => {
    const batch = await createBatch(operator, { productId, supplierId, units: 15, unitPrice: 1450 });
    const id = batch.data?.id ?? "";
    expect((await admin.rpc("archive_batch", { p_batch_id: id, p_archived: true })).error).toBeNull();
    expect(await totalCost(id)).toBe(21750);
  });
});
