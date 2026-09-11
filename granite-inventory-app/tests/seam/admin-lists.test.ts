import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createProduct, createSupplier } from "./fixtures";

describe("admin lists: rename and guarded delete", () => {
  let admin: Db;
  let operator: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
  });

  it("operators cannot rename or delete; admins can, unless batches reference the row", async () => {
    const productId = await createProduct(operator, { name: "Black Perl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const spare = await createSupplier(operator, "Nobody Quarry");

    const byOperator = await operator.from("products").update({ name: "Black Pearl" }).eq("id", productId).select();
    expect(byOperator.data).toEqual([]);

    const renamed = await admin.from("products").update({ name: "Black Pearl" }).eq("id", productId).select().single();
    expect(renamed.data?.name).toBe("Black Pearl");

    await createBatch(operator, { productId, supplierId });
    expectError(await admin.from("products").delete().eq("id", productId).select());
    expectError(await admin.from("suppliers").delete().eq("id", supplierId).select());
    const variant = await admin.from("variants").select("id").single();
    expectError(await admin.from("variants").delete().eq("id", variant.data?.id ?? "").select());

    const gone = await admin.from("suppliers").delete().eq("id", spare).select();
    expect(gone.data).toHaveLength(1);
    const batch = await admin.from("v_batches").select("product_name").single();
    expect(batch.data?.product_name).toBe("Black Pearl");
  });
});
