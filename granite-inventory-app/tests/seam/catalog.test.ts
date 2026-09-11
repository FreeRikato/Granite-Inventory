import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createProduct, createSupplier } from "./fixtures";

describe("public catalog: v_public_catalog for anon", () => {
  let operator: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    await createBatch(operator, { productId, supplierId, units: 10 });
    await createBatch(operator, { productId, supplierId, units: 4 });
    const sold = await createBatch(operator, { productId, supplierId, units: 2, length: 5, breadth: 3, thickness: 20 });
    await sql(`update public.batches set units_sold = 2 where id = $1`, [sold.data?.id]);
  });

  it("is empty while the catalog is off, and lists only lines with stock once on", async () => {
    const anon = anonClient();
    expect((await anon.from("v_public_catalog").select("*")).data).toEqual([]);

    await sql(`update public.settings set catalog_public = true`);
    const { data } = await anon.from("v_public_catalog").select("*");
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ product_name: "Black Pearl", variant_name: "Grade 1", available: 14, length_ft: 4 });
    expect(Object.keys(data?.[0] ?? {}).sort()).toEqual(
      ["available", "breadth_ft", "category", "length_ft", "line_key", "product_name", "thickness_mm", "variant_name"].sort(),
    );
  });

  it("anon still cannot read anything private", async () => {
    await sql(`update public.settings set catalog_public = true`);
    const anon = anonClient();
    const results = await Promise.all([
      anon.from("batches").select("*"),
      anon.from("v_batches").select("*"),
      anon.from("v_stock_lines").select("*"),
      anon.from("suppliers").select("*"),
      anon.from("sales").select("*"),
      anon.from("customers").select("*"),
      anon.from("settings").select("*"),
    ]);
    for (const r of results) expect(r.data).toEqual([]);
    const business = await anon.from("v_public_business").select("*").single();
    expect(business.data?.catalog_public).toBe(true);
  });
});
