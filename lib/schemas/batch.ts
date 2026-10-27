import { z } from "zod";
import { CATEGORIES, DEFAULT_VARIANT } from "@/lib/domain";
import { isoDate, money, positiveInteger, positiveNumber } from "./common";

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
  thicknessMm: positiveInteger("Must be more than 0"),
});

const unsizedBatch = z.object({
  memorial: z.literal(true),
});

export const batchSchema = z
  .object({
    productId: z.string({ error: "Pick a product" }).uuid("Pick a product"),
    variantName: z.string().trim().min(1).max(80).default(DEFAULT_VARIANT),
    supplierId: z.string({ error: "Pick a supplier" }).uuid("Pick a supplier"),
    purchaseDate: isoDate,
    slot: z.string().trim().min(1, "Pick a yard slot").max(20, "Yard slot must be 20 characters or fewer"),
    initialUnits: positiveInteger("Unit Quantity must be greater than zero"),
    unitPurchasePrice: money("Unit Purchase Price"),
    freightCost: money("Freight Cost").default(0),
    notes: z.string().trim().max(500).optional(),
    stackNumber: z.string().trim().max(20, "Batch number must be 20 characters or fewer").optional(),
  })
  .and(z.discriminatedUnion("memorial", [sizedBatch, unsizedBatch]));

export type BatchInput = z.infer<typeof batchSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
