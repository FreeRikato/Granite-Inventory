"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { saleSchema } from "@/lib/schemas/sale";
import { saleRpcArgs } from "@/lib/rpc-args";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export async function recordSaleAction(input: unknown): Promise<ActionResult<Tables<"sales">>> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const s = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sale", saleRpcArgs(s));
  if (error) return fail(messageOf(error));
  revalidateSales();
  return ok(data);
}

const saleCorrectionSchema = z.object({ saleId: z.string().uuid() }).and(saleSchema);

export async function correctSaleAction(input: unknown): Promise<ActionResult<Tables<"sales">>> {
  const parsed = saleCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const s = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_sale", { p_sale_id: s.saleId, ...saleRpcArgs(s) });
  if (error) return fail(messageOf(error));
  revalidateSales();
  return ok(data);
}

export async function deleteSaleAction(saleId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_sale", { p_sale_id: saleId });
  if (error) return fail(messageOf(error));
  revalidateSales();
  return ok(null);
}

function revalidateSales() {
  revalidatePath("/sell");
  revalidatePath("/yard");
  revalidatePath("/customers", "layout");
  revalidatePath("/");
}
