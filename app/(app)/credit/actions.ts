"use server";

import { revalidatePath } from "next/cache";
import { fail, messageOf, ok, type ActionResult } from "@/lib/action-result";
import {
  correctCreditPaymentSchema,
  extendPayBySchema,
  recordCreditPaymentSchema,
  type ReceiptInput,
} from "@/lib/schemas/credit";
import { createClient } from "@/lib/supabase/server";

function receiptArg(payments: ReceiptInput) {
  return payments.map((p) => ({ payment_mode: p.paymentMode, amount: p.amount }));
}

export async function recordCreditPaymentAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = recordCreditPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the payment");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_credit_payment", {
    p_bill_id: parsed.data.billId,
    p_paid_on: parsed.data.paidOn,
    p_payments: receiptArg(parsed.data.payments),
  });
  if (error) return fail(messageOf(error));
  revalidateCredit();
  return ok(null);
}

export async function correctCreditPaymentAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = correctCreditPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the payment");
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_credit_payment", {
    p_payment_id: parsed.data.paymentId,
    p_paid_on: parsed.data.paidOn,
    p_payments: receiptArg(parsed.data.payments),
  });
  if (error) return fail(messageOf(error));
  revalidateCredit();
  return ok(null);
}

export async function deleteCreditPaymentAction(paymentId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_credit_payment", { p_payment_id: paymentId });
  if (error) return fail(messageOf(error));
  revalidateCredit();
  return ok(null);
}

export async function extendPayByAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = extendPayBySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Pick a date");
  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_pay_by", {
    p_bill_id: parsed.data.billId,
    p_pay_by: parsed.data.payBy,
  });
  if (error) return fail(messageOf(error));
  revalidateCredit();
  return ok(null);
}

function revalidateCredit() {
  revalidatePath("/credit");
  revalidatePath("/customers", "layout");
  revalidatePath("/");
}
