"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import { batchSchema } from "@/lib/schemas/batch";
import { batchRpcArgs } from "@/lib/rpc-args";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

const correctionSchema = z.object({ batchId: z.string().uuid() }).and(batchSchema);

function revalidateStock() {
  revalidatePath("/yard");
  revalidatePath("/inward");
  revalidatePath("/sell");
  revalidatePath("/");
}

export async function correctBatchAction(input: unknown): Promise<ActionResult<Tables<"batches">>> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const b = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_batch", { p_batch_id: b.batchId, ...batchRpcArgs(b) });
  if (error) return fail(messageOf(error));
  revalidateStock();
  return ok(data);
}

export async function deleteBatchAction(batchId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_batch", { p_batch_id: batchId });
  if (error) return fail(messageOf(error));
  revalidateStock();
  return ok(null);
}
