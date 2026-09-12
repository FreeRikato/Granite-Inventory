"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORIES, ROLES, type Role } from "@/lib/domain";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { settingsSchema } from "@/lib/schemas/settings";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import {
  batchReferenceColumn,
  deleteBlockedMessage,
  hasDeleteReferences,
  tableLabel,
  type AdminListTable,
  type DeleteReferences,
} from "@/lib/admin-list-references";

export async function updateSettingsAction(input: unknown): Promise<ActionResult<Tables<"settings">>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the settings");
  const s = parsed.data;
  const patch = {
    ...(s.businessName !== undefined && { business_name: s.businessName }),
    ...(s.tagline !== undefined && { tagline: s.tagline }),
    ...(s.ageingAfterDays !== undefined && { ageing_after_days: s.ageingAfterDays }),
    ...(s.staleAfterDays !== undefined && { stale_after_days: s.staleAfterDays }),
    ...(s.catalogPublic !== undefined && { catalog_public: s.catalogPublic }),
    ...(s.whatsappNumber !== undefined && { whatsapp_number: s.whatsappNumber }),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").update(patch).eq("id", true).select().maybeSingle();
  if (error) {
    if (/settings_ageing_before_stale/.test(error.message)) return fail("Ageing must come before Stale");
    return fail(messageOf(error));
  }
  if (!data) return fail("Only an Admin can change settings");
  revalidatePath("/", "layout");
  revalidatePath("/catalog");
  return ok(data);
}

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a Google email"),
  name: z.string().trim().max(80).optional(),
  role: z.enum(ROLES),
});

export async function addMemberAction(input: unknown): Promise<ActionResult<Tables<"team_members">>> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid member");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_members")
    .insert({ email: parsed.data.email, name: parsed.data.name || null, role: parsed.data.role })
    .select()
    .single();
  if (error) return fail(/duplicate key/.test(error.message) ? "That account is already on the list" : messageOf(error));
  revalidatePath("/settings");
  return ok(data);
}

export async function setMemberRoleAction(id: string, role: Role): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_members").update({ role }).eq("id", id).select("id");
  if (error) return fail(messageOf(error));
  if (!data || data.length === 0) return fail("Only an Admin can change roles");
  revalidatePath("/settings");
  return ok(null);
}

export async function removeMemberAction(id: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_members").delete().eq("id", id).select("id");
  if (error) return fail(messageOf(error));
  if (!data || data.length === 0) return fail("Only an Admin can remove members");
  revalidatePath("/settings");
  return ok(null);
}

/* Admin lists: rename or delete Products, Variants and Suppliers. Deletes are refused by
   the database while Batches reference the row. */
const renameSchema = z.object({
  table: z.enum(["products", "variants", "suppliers"]),
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(80),
  abbreviation: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "1 to 4 letters or digits").optional(),
  category: z.enum(CATEGORIES).optional(),
});

export async function renameRowAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid name");
  const { table, id, name, abbreviation, category } = parsed.data;
  const supabase = await createClient();
  const query =
    table === "products"
      ? supabase.from("products").update({ name, ...(abbreviation && { abbreviation }), ...(category && { category }) })
      : table === "variants"
        ? supabase.from("variants").update({ name })
        : supabase.from("suppliers").update({ name });
  const { data, error } = await query.eq("id", id).select("id");
  if (error) return fail(messageOf(error));
  if (!data || data.length === 0) return fail("Only an Admin can rename");
  revalidatePath("/", "layout");
  return ok(null);
}

export async function deleteRowAction(table: AdminListTable, id: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const references = await findDeleteReferences(supabase, table, id);
  if (!references.ok) return references;
  if (hasDeleteReferences(table, references.data)) {
    return fail(
      deleteBlockedMessage(
        table,
        references.data.batches,
        references.data.variants,
        references.data.batches.length > 0 ? references.data.rowName : undefined,
      ),
    );
  }

  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") {
      const latest = await findDeleteReferences(supabase, table, id);
      if (latest.ok && hasDeleteReferences(table, latest.data)) {
        return fail(
          deleteBlockedMessage(
            table,
            latest.data.batches,
            latest.data.variants,
            latest.data.batches.length > 0 ? latest.data.rowName : undefined,
          ),
        );
      }
    }
    return fail(messageOf(error));
  }
  if (!data || data.length === 0) return fail("Only an Admin can delete");
  revalidatePath("/", "layout");
  return ok(null);
}

async function findDeleteReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: AdminListTable,
  id: string,
): Promise<ActionResult<DeleteReferences>> {
  const { data, error } = await supabase
    .from("v_batches")
    .select("batch_code, product_id, variant_id, supplier_id")
    .eq(batchReferenceColumn[table], id);
  if (error) return fail(messageOf(error));
  const row = await supabase.from(table).select("name").eq("id", id).maybeSingle();
  if (row.error) return fail(messageOf(row.error));
  const rowName = row.data?.name ?? tableLabel[table];
  if (table !== "products") {
    return ok({ rowName, batches: data ?? [], variants: [] });
  }

  const variants = await supabase.from("variants").select("id, name, product_id").eq("product_id", id);
  if (variants.error) return fail(messageOf(variants.error));
  return ok({ rowName, batches: data ?? [], variants: variants.data ?? [] });
}
