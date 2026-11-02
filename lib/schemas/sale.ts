import { z } from "zod";
import { CUSTOMER_TYPES, PAYMENT_MODES } from "@/lib/domain";
import { isoDate, money, name, positiveInteger, requiredMoney } from "./common";

export const customerSchema = z.object({
  name,
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\+?[0-9 ]{6,20})?$/, "Enter a valid phone number")
    .optional()
    .transform((v) => (v ? v : undefined)),
  customerType: z.enum(CUSTOMER_TYPES),
});

export const saleSchema = z.object({
  batchId: z.string().uuid("Pick a batch"),
  customerId: z.string().uuid("Pick a customer"),
  saleDate: isoDate,
  quantity: positiveInteger("Sale quantity must be greater than zero"),
  saleRate: requiredMoney("Stone Sale Price"),
  paymentMode: z.enum(PAYMENT_MODES),
  hasStickering: z.boolean(),
  stickeringCostRate: money("Stickering Cost").default(0),
  stickeringRate: money("Stickering Price").default(0),
  notes: z.string().trim().max(500).optional(),
});

export const paymentSchema = z.object({
  paymentMode: z.enum(PAYMENT_MODES),
  amount: money("Payment amount").optional(),
});

export const paymentsSchema = z
  .array(paymentSchema)
  .min(1, "Pick at least one payment mode")
  .refine(
    (payments) => new Set(payments.map((p) => p.paymentMode)).size === payments.length,
    "Each payment mode can appear only once on a bill",
  );

export const billLineSchema = saleSchema.pick({
  batchId: true,
  quantity: true,
  saleRate: true,
  hasStickering: true,
  stickeringCostRate: true,
  stickeringRate: true,
});

export const billSchema = z
  .object({
    customerId: saleSchema.shape.customerId,
    saleDate: saleSchema.shape.saleDate,
    payments: z.array(paymentSchema),
    onCredit: z.boolean().optional(),
    payBy: isoDate.optional(),
    lines: z.array(billLineSchema).min(1, "Add at least one line to the order"),
  })
  .superRefine((bill, ctx) => {
    if (!bill.onCredit && bill.payments.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pick at least one payment mode", path: ["payments"] });
    }
    if (new Set(bill.payments.map((p) => p.paymentMode)).size !== bill.payments.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each payment mode can appear only once on a bill",
        path: ["payments"],
      });
    }
  });

export type SaleInput = z.infer<typeof saleSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type BillLineInput = z.infer<typeof billLineSchema>;
export type BillInput = z.infer<typeof billSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
