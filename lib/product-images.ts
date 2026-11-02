import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

export const PRODUCT_IMAGE_BUCKET = "product-images";

export type ImageExtension = "webp" | "jpg";

export function productImageUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`;
}

export function newProductImagePath(productId: string, extension: ImageExtension): string {
  return `${productId}/${crypto.randomUUID()}.${extension}`;
}

export async function removeProductImageFile(db: SupabaseClient<Database>, path: string | null): Promise<void> {
  if (!path) return;
  await db.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
}

export async function deleteProduct(db: SupabaseClient<Database>, id: string) {
  const row = await db.from("products").select("image_path").eq("id", id).maybeSingle();
  const result = await db.from("products").delete().eq("id", id).select("id");
  if (!result.error && result.data.length > 0) await removeProductImageFile(db, row.data?.image_path ?? null);
  return result;
}
