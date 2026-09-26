"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { customerSchema } from "@/lib/schemas/sale";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type CreatedCustomer = Tables<"customers"> & { readonly existed: boolean };

/* A phone that is already on file selects that customer instead of creating a duplicate. */
export async function createCustomerAction(input: unknown): Promise<ActionResult<CreatedCustomer>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid customer");
  const supabase = await createClient();
  if (parsed.data.phone) {
    const digits = parsed.data.phone.replace(/\D/g, "").slice(-10);
    const { data: existing } = await supabase.from("customers").select("*").not("phone", "is", null);
    const match = (existing ?? []).find((c) => (c.phone ?? "").replace(/\D/g, "").slice(-10) === digits);
    if (match) return ok({ ...match, existed: true });
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ name: parsed.data.name, phone: parsed.data.phone ?? null, customer_type: parsed.data.customerType })
    .select()
    .single();
  if (error) return fail(messageOf(error));
  revalidatePath("/customers");
  return ok({ ...data, existed: false });
}

const updateSchema = customerSchema.extend({ id: z.string().uuid() });

export async function updateCustomerAction(input: unknown): Promise<ActionResult<Tables<"customers">>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid customer");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ name: parsed.data.name, phone: parsed.data.phone ?? null, customer_type: parsed.data.customerType })
    .eq("id", parsed.data.id)
    .select()
    .single();
  if (error) return fail(messageOf(error));
  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.id}`);
  return ok(data);
}

export async function deleteCustomerAction(id: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) return fail(messageOf(error));
  if (!data || data.length === 0) return fail("Only an Admin can delete customers");
  revalidatePath("/customers");
  return ok(null);
}
