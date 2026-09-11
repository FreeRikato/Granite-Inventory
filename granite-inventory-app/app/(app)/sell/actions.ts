"use server";

import { revalidatePath } from "next/cache";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { customerSchema, saleSchema } from "@/lib/schemas/sale";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export async function createCustomerAction(input: unknown): Promise<ActionResult<Tables<"customers">>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid customer");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ name: parsed.data.name, phone: parsed.data.phone ?? null, customer_type: parsed.data.customerType })
    .select()
    .single();
  if (error) return fail(messageOf(error));
  revalidatePath("/customers");
  return ok(data);
}

export async function recordSaleAction(input: unknown): Promise<ActionResult<Tables<"sales">>> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const s = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sale", {
    p_batch_id: s.batchId,
    p_customer_id: s.customerId,
    p_sale_date: s.saleDate,
    p_quantity: s.quantity,
    p_sale_price: s.salePrice,
    p_payment_mode: s.paymentMode,
    p_has_stickering: s.hasStickering,
    p_stickering_cost: s.hasStickering ? s.stickeringCost : 0,
    p_stickering_price: s.hasStickering ? s.stickeringPrice : 0,
    p_misc_expense: s.miscExpense,
    p_notes: s.notes,
  });
  if (error) return fail(messageOf(error));
  revalidatePath("/sell");
  revalidatePath("/yard");
  revalidatePath("/customers");
  revalidatePath("/");
  return ok(data);
}
