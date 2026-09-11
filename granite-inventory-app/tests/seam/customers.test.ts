import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordSale } from "./fixtures";

describe("customers: v_customers and deletion rules", () => {
  let operator: Db;
  let admin: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
  });

  beforeEach(async () => {
    await resetDomainData();
  });

  it("derives last purchase, sale count and revenue; no purchases reads as null", async () => {
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const { data: batch } = await createBatch(operator, { productId, supplierId, units: 20 });
    const murugan = await createCustomer(operator, { name: "Murugan", phone: "9876543210", type: "CONTRACTOR" });
    await createCustomer(operator, { name: "St. Xavier's Trust", type: "TRUST" });
    await recordSale(operator, { batchId: batch?.id ?? "", customerId: murugan, quantity: 2, salePrice: 1000, saleDate: daysAgo(10) });
    await recordSale(operator, { batchId: batch?.id ?? "", customerId: murugan, quantity: 1, salePrice: 1500, saleDate: daysAgo(3), stickering: { cost: 100, price: 250 } });

    const { data } = await operator.from("v_customers").select("name, last_purchase_date, sale_count, lifetime_revenue").order("name");
    const byName = Object.fromEntries((data ?? []).map((r) => [r.name, r]));
    expect(byName["Murugan"]).toMatchObject({ last_purchase_date: daysAgo(3), sale_count: 2, lifetime_revenue: 3750 });
    expect(byName["St. Xavier's Trust"]).toMatchObject({ last_purchase_date: null, sale_count: 0, lifetime_revenue: 0 });
  });

  it("operators may rename and retype; only admin deletes, and never a customer with sales", async () => {
    const id = await createCustomer(operator, { name: "Walkin Bob", type: "RETAIL" });
    const rename = await operator.from("customers").update({ name: "Bob", customer_type: "REGULAR" }).eq("id", id).select().single();
    expect(rename.data?.name).toBe("Bob");
    expect(rename.data?.updated_by).toBe("operator@test.local");

    const byOperator = await operator.from("customers").delete().eq("id", id).select();
    expect(byOperator.data).toEqual([]);

    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const { data: batch } = await createBatch(operator, { productId, supplierId });
    await recordSale(operator, { batchId: batch?.id ?? "", customerId: id });
    expectError(await admin.from("customers").delete().eq("id", id).select());

    const fresh = await createCustomer(operator, { name: "Nobody" });
    const gone = await admin.from("customers").delete().eq("id", fresh).select();
    expect(gone.data).toHaveLength(1);
  });
});
