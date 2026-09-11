"use server";

import { revalidatePath } from "next/cache";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { settingsSchema } from "@/lib/schemas/settings";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

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
