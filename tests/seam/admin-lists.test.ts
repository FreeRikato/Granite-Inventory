import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteBlockedMessage, hasDeleteReferences, type BatchReference } from "@/lib/admin-list-references";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createProduct, createSupplier } from "./fixtures";

const batchReference: BatchReference = {
  batch_code: "JB-12SEP26-01",
  product_id: "product-id",
  supplier_id: "supplier-id",
};

describe("admin-list reference helpers", () => {
  it("treats only batches as blockers", () => {
    expect(hasDeleteReferences({ batches: [batchReference] })).toBe(true);
    expect(hasDeleteReferences({ batches: [] })).toBe(false);
  });

  it("uses the row name", () => {
    expect(deleteBlockedMessage("products", [], "Jet Black Granite")).toBe("Only possible when no batch uses it.");
    expect(deleteBlockedMessage("suppliers", [batchReference], "Madurai Quarry")).toBe(
      "Cannot delete Madurai Quarry: batch JB-12SEP26-01 still uses it.",
    );
  });

  it("names a Product when one Batch blocks deletion", () => {
    expect(deleteBlockedMessage("products", [batchReference], "Jet Black Granite")).toBe(
      "Cannot delete Jet Black Granite: batch JB-12SEP26-01 still uses it.",
    );
  });
});

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
    expectError(
      await admin
        .from("variants")
        .delete()
        .eq("id", variant.data?.id ?? "")
        .select(),
    );

    const gone = await admin.from("suppliers").delete().eq("id", spare).select();
    expect(gone.data).toHaveLength(1);
    const batch = await admin.from("v_batches").select("product_name").single();
    expect(batch.data?.product_name).toBe("Black Pearl");
  });

  it("deleting a Product with no batches takes its unused variants with it", async () => {
    const productId = await createProduct(operator, { name: "Orphan Product", abbreviation: "OP" });
    await sql(`insert into public.variants (product_id, name) values ($1, 'Oval')`, [productId]);
    const gone = await admin.from("products").delete().eq("id", productId).select();
    expect(gone.data).toHaveLength(1);
    expect(await sql(`select id from public.variants where product_id = $1`, [productId])).toEqual([]);
  });
});
