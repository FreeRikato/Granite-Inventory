import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/domain";
import { isoDate } from "./common";

const receiptLine = z.object({
  paymentMode: z.enum(PAYMENT_MODES),
  amount: z.coerce.number().positive("Each payment must be more than zero").lt(1e10, "Number is too large"),
});

const receiptLines = z
  .array(receiptLine)
  .min(1, "Pick at least one payment mode")
  .refine(
    (lines) => new Set(lines.map((l) => l.paymentMode)).size === lines.length,
    "Each payment mode can appear only once on a bill",
  );

export const recordCreditPaymentSchema = z.object({
  billId: z.string().uuid("Pick a bill"),
  paidOn: isoDate,
  payments: receiptLines,
});

export const correctCreditPaymentSchema = z.object({
  paymentId: z.string().uuid("Pick a payment"),
  paidOn: isoDate,
  payments: receiptLines,
});

export const extendPayBySchema = z.object({
  billId: z.string().uuid("Pick a bill"),
  payBy: isoDate,
});

export type ReceiptInput = z.infer<typeof receiptLines>;
