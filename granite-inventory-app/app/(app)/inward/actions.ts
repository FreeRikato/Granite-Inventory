"use server";

import { revalidatePath } from "next/cache";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { batchSchema, productSchema, supplierSchema } from "@/lib/schemas/batch";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export async function createProductAction(input: unknown): Promise<ActionResult<Tables<"products">>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid product");
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").insert(parsed.data).select().single();
  if (error) return fail(messageOf(error));
  return ok(data);
}

export async function createSupplierAction(input: unknown): Promise<ActionResult<Tables<"suppliers">>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid supplier");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name: parsed.data.name, phone: parsed.data.phone || null })
    .select()
    .single();
  if (error) return fail(messageOf(error));
  return ok(data);
}

export async function saveBatchAction(input: unknown): Promise<ActionResult<Tables<"batches">>> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const b = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_batch", {
    p_product_id: b.productId,
    p_variant_name: b.variantName,
    p_supplier_id: b.supplierId,
    p_purchase_date: b.purchaseDate,
    p_length_ft: b.memorial ? undefined : b.lengthFt,
    p_breadth_ft: b.memorial ? undefined : b.breadthFt,
    p_thickness_mm: b.memorial ? undefined : b.thicknessMm,
    p_slot: b.slot,
    p_initial_units: b.initialUnits,
    p_unit_purchase_price: b.unitPurchasePrice,
    p_freight_cost: b.freightCost,
    p_notes: b.notes,
  });
  if (error) return fail(messageOf(error));
  revalidatePath("/inward");
  revalidatePath("/yard");
  revalidatePath("/");
  return ok(data);
}
