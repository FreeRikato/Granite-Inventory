import { z } from "zod";
import { CATEGORIES, SLOTS } from "@/lib/domain";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.coerce.number().min(0, "Cannot be negative");
const positiveNumber = z.coerce.number().positive("Must be more than 0");

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  abbreviation: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,4}$/, "1 to 4 letters or digits"),
  category: z.enum(CATEGORIES),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: z.string().trim().max(20).optional(),
});

const sizedBatch = z.object({
  memorial: z.literal(false),
  lengthFt: positiveNumber,
  breadthFt: positiveNumber,
  thicknessMm: z.coerce.number().int().positive("Must be more than 0"),
});

const unsizedBatch = z.object({
  memorial: z.literal(true),
});

export const batchSchema = z
  .object({
    productId: z.string().uuid("Pick a product"),
    variantName: z.string().trim().min(1, "Variant is required").max(80),
    supplierId: z.string().uuid("Pick a supplier"),
    purchaseDate: isoDate,
    slot: z.enum(SLOTS),
    initialUnits: z.coerce.number().int().positive("At least 1 piece"),
    unitPurchasePrice: money,
    freightCost: money.default(0),
    notes: z.string().trim().max(500).optional(),
  })
  .and(z.discriminatedUnion("memorial", [sizedBatch, unsizedBatch]));

export type BatchInput = z.infer<typeof batchSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
