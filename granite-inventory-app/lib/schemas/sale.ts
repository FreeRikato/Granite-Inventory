import { z } from "zod";
import { CUSTOMER_TYPES, PAYMENT_MODES } from "@/lib/domain";

const money = z.coerce.number().min(0, "Cannot be negative");

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
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
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  quantity: z.coerce.number().int().positive("At least 1 piece"),
  salePrice: money,
  paymentMode: z.enum(PAYMENT_MODES),
  hasStickering: z.boolean(),
  stickeringCost: money.default(0),
  stickeringPrice: money.default(0),
  miscExpense: money.default(0),
  notes: z.string().trim().max(500).optional(),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
