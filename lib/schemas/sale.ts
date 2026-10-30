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
  stickeringCost: money("Stickering Cost").default(0),
  stickeringPrice: money("Stickering Price").default(0),
  notes: z.string().trim().max(500).optional(),
});

export const billLineSchema = saleSchema.pick({
  batchId: true,
  quantity: true,
  saleRate: true,
  hasStickering: true,
  stickeringCost: true,
  stickeringPrice: true,
});

export const billSchema = z.object({
  customerId: saleSchema.shape.customerId,
  saleDate: saleSchema.shape.saleDate,
  paymentMode: saleSchema.shape.paymentMode,
  lines: z.array(billLineSchema).min(1, "Add at least one line to the order"),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type BillLineInput = z.infer<typeof billLineSchema>;
export type BillInput = z.infer<typeof billSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
