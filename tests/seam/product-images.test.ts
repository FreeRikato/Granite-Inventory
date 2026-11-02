import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, resetDomainData, serviceClient, signedInClient, sql, type Db } from "./harness";
import { createBatch, createProduct, createSupplier } from "./fixtures";
import { deleteProduct, newProductImagePath, PRODUCT_IMAGE_BUCKET, productImageUrl } from "@/lib/product-images";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function png(): Blob {
  return new Blob([PNG], { type: "image/png" });
}

async function exists(path: string): Promise<boolean> {
  return (await fetch(productImageUrl(path))).ok;
}

describe("product images: bucket policies and the image_path rule", () => {
  let admin: Db;
  let operator: Db;
  let productId: string;
  let otherId: string;
  const created: string[] = [];

  function track(path: string): string {
    created.push(path);
    return path;
  }

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    otherId = await createProduct(operator, { name: "Jet Black", abbreviation: "JB" });
  });

  afterEach(async () => {
    if (created.length > 0) await serviceClient().storage.from(PRODUCT_IMAGE_BUCKET).remove(created.splice(0));
  });

  it("an Admin can upload, replace and delete a file", async () => {
    const first = track(newProductImagePath(productId, "webp"));
    const second = track(newProductImagePath(productId, "webp"));
    const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);

    expect((await bucket.upload(first, png(), { contentType: "image/png" })).error).toBeNull();
    expect(await exists(first)).toBe(true);

    expect((await bucket.upload(first, png(), { contentType: "image/png", upsert: true })).error).toBeNull();
    expect((await bucket.upload(second, png(), { contentType: "image/png" })).error).toBeNull();
    expect((await bucket.remove([first])).error).toBeNull();
    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
  });

  it.each([
    ["an operator", () => operator],
    ["an anonymous visitor", () => anonClient()],
  ])("%s cannot upload, replace or delete a file", async (_who, client) => {
    const kept = track(newProductImagePath(productId, "webp"));
    await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(kept, png(), { contentType: "image/png" });
    const bucket = client().storage.from(PRODUCT_IMAGE_BUCKET);

    const fresh = newProductImagePath(productId, "webp");
    expect((await bucket.upload(fresh, png(), { contentType: "image/png" })).error).not.toBeNull();
    expect((await bucket.upload(kept, png(), { contentType: "image/png", upsert: true })).error).not.toBeNull();
    expect((await bucket.update(kept, png(), { contentType: "image/png" })).error).not.toBeNull();
    expect((await bucket.remove([kept])).data).toEqual([]);

    expect(await exists(kept)).toBe(true);
    expect(await exists(fresh)).toBe(false);
  });

  it("a visitor reads a file by its public URL but cannot list the bucket", async () => {
    const path = track(newProductImagePath(productId, "webp"));
    await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, png(), { contentType: "image/png" });

    const response = await fetch(productImageUrl(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const visitor = anonClient().storage.from(PRODUCT_IMAGE_BUCKET);
    expect((await visitor.list(productId)).data ?? []).toEqual([]);
    expect(((await admin.storage.from(PRODUCT_IMAGE_BUCKET).list(productId)).data ?? []).length).toBe(1);
  });

  it("the bucket refuses files over 2 MiB and types other than webp, jpeg and png", async () => {
    const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
    const big = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/png" });
    expect(
      (await bucket.upload(newProductImagePath(productId, "webp"), big, { contentType: "image/png" })).error,
    ).not.toBeNull();
    const gif = new Blob([PNG], { type: "image/gif" });
    expect(
      (await bucket.upload(newProductImagePath(productId, "webp"), gif, { contentType: "image/gif" })).error,
    ).not.toBeNull();
    const rows = await sql(`select public, file_size_limit from storage.buckets where id = 'product-images'`);
    expect(rows).toEqual([{ public: true, file_size_limit: "2097152" }]);
  });

  it("image_path must start with the Product's own id, and only an Admin can set it", async () => {
    const own = newProductImagePath(productId, "webp");
    const foreign = newProductImagePath(otherId, "webp");

    const refused = await admin.from("products").update({ image_path: foreign }).eq("id", productId).select("id");
    expect(refused.error?.message).toMatch(/products_image_path_own/);

    const byOperator = await operator.from("products").update({ image_path: own }).eq("id", productId).select("id");
    expect(byOperator.data ?? []).toEqual([]);

    const accepted = await admin.from("products").update({ image_path: own }).eq("id", productId).select("image_path");
    expect(accepted.data).toEqual([{ image_path: own }]);
  });

  it("v_public_catalog carries image_path and nothing sensitive", async () => {
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    await createBatch(operator, { productId, supplierId, units: 5 });
    await createBatch(operator, { productId, supplierId, units: 3, length: 5, breadth: 3, thickness: 20 });
    const path = newProductImagePath(productId, "webp");
    await admin.from("products").update({ image_path: path }).eq("id", productId);
    await sql(`update public.settings set catalog_public = true`);

    const { data } = await anonClient().from("v_public_catalog").select("*");
    expect(data).toHaveLength(2);
    expect(data?.every((l) => l.image_path === path)).toBe(true);
    expect(Object.keys(data?.[0] ?? {}).sort()).toEqual(
      [
        "available",
        "breadth_ft",
        "category",
        "image_path",
        "length_ft",
        "line_key",
        "product_name",
        "thickness_mm",
      ].sort(),
    );
  });

  it("deleting a Product removes its image file, archiving keeps it", async () => {
    const path = track(newProductImagePath(productId, "webp"));
    await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, png(), { contentType: "image/png" });
    await admin.from("products").update({ image_path: path }).eq("id", productId);

    await admin.from("products").update({ archived_at: new Date().toISOString() }).eq("id", productId);
    expect(await exists(path)).toBe(true);

    const result = await deleteProduct(admin, productId);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: productId }]);
    expect(await exists(path)).toBe(false);
  });
});
