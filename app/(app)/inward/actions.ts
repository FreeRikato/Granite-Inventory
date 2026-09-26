"use server";

import { revalidatePath } from "next/cache";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { batchSchema, productSchema, supplierSchema } from "@/lib/schemas/batch";
import { batchRpcArgs } from "@/lib/rpc-args";
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
  const { data, error } = await supabase.rpc("create_batch", batchRpcArgs(b));
  if (error) return fail(messageOf(error));
  revalidatePath("/inward");
  revalidatePath("/yard");
  revalidatePath("/");
  return ok(data);
}
