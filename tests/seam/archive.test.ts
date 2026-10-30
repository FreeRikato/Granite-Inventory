import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, recordSale, today } from "./fixtures";

describe("archive: batches, products and suppliers", () => {
  let admin: Db;
  let operator: Db;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  let kept: string;
  let archived: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan" });
    kept = (await createBatch(operator, { productId, supplierId, units: 10, unitPrice: 125 })).data?.id ?? "";
    archived = (await createBatch(operator, { productId, supplierId, units: 6, unitPrice: 250 })).data?.id ?? "";
    await recordSale(operator, { batchId: archived, customerId, quantity: 2, saleRate: 312.5 });
  });

  function archiveBatch(db: Db, id: string, value = true) {
    return db.rpc("archive_batch", { p_batch_id: id, p_archived: value });
  }

  it("only an Admin archives a batch, even one with sales, and unarchiving brings it back", async () => {
    expect(expectError(await archiveBatch(operator, archived)).message).toMatch(/Only an Admin/);

    const done = await archiveBatch(admin, archived);
    expect(done.error).toBeNull();
    expect(done.data?.archived_at).not.toBeNull();
    const yard = await operator.from("v_yard_batches").select("id, archived_at").eq("id", archived).single();
    expect(yard.data?.archived_at).not.toBeNull();

    const back = await archiveBatch(admin, archived, false);
    expect(back.data?.archived_at).toBeNull();
    expect(expectError(await archiveBatch(admin, crypto.randomUUID())).message).toBe("Unknown batch");
  });

  it("an archived batch leaves Stock Lines, the Public Catalog and the stock KPIs, but its sales stay", async () => {
    await sql(`update public.settings set catalog_public = true`);
    await archiveBatch(admin, archived);

    const line = await operator.from("v_stock_lines").select("available, batch_count").single();
    expect(line.data).toEqual({ available: 10, batch_count: 1 });

    const catalog = await anonClient().from("v_public_catalog").select("available").single();
    expect(catalog.data?.available).toBe(10);

    const kpis = await operator
      .from("v_dashboard_kpis")
      .select("active_stock, inventory_value, units_sold_total, mtd_sales")
      .single();
    expect(kpis.data).toEqual({ active_stock: 10, inventory_value: 10000, units_sold_total: 2, mtd_sales: 1 });

    const sales = await operator.from("v_sales").select("quantity").eq("batch_id", archived);
    expect(sales.data).toEqual([{ quantity: 2 }]);
  });

  it("an archived batch cannot be sold from, and a sale cannot be moved onto it", async () => {
    await archiveBatch(admin, archived);
    const refused = await recordSale(operator, { batchId: archived, customerId, quantity: 1 });
    expect(expectError(refused).message).toMatch(/^Batch BP-.* is archived; unarchive it to sell from it$/);

    const sale = (await recordSale(operator, { batchId: kept, customerId, quantity: 1 })).data?.id ?? "";
    const moved = await admin.rpc("correct_sale", {
      p_sale_id: sale,
      p_batch_id: archived,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 187.5,
      p_payment_mode: "CASH",
    });
    expect(expectError(moved).message).toMatch(/is archived; unarchive it to sell from it$/);

    const [onArchived] = await sql<{ id: string }>(`select id from public.sales where batch_id = '${archived}'`);
    const edited = await admin.rpc("correct_sale", {
      p_sale_id: onArchived?.id ?? "",
      p_batch_id: archived,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 312.5,
      p_payment_mode: "CASH",
    });
    expect(edited.error).toBeNull();
  });

  it("an archived Product or Supplier takes no new batches, but existing batches keep it", async () => {
    const otherSupplier = await createSupplier(operator, "Salem Quarry");
    const byOperator = await operator
      .from("products")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", productId)
      .select();
    expect(byOperator.data).toEqual([]);

    await admin.from("products").update({ archived_at: new Date().toISOString() }).eq("id", productId);
    const product = await createBatch(operator, { productId, supplierId });
    expect(expectError(product).message).toBe("Product Black Pearl is archived; unarchive it in Settings first");

    await admin.from("suppliers").update({ archived_at: new Date().toISOString() }).eq("id", otherSupplier);
    await admin.from("products").update({ archived_at: null }).eq("id", productId);
    const supplier = await createBatch(operator, { productId, supplierId: otherSupplier });
    expect(expectError(supplier).message).toBe("Supplier Salem Quarry is archived; unarchive it in Settings first");

    const view = await operator.from("v_batches").select("supplier_name").eq("id", kept).single();
    expect(view.data?.supplier_name).toBe("Madurai Quarry");
  });
});
