import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const money = z.coerce.number().min(0, "Cannot be negative");
export const positiveNumber = z.coerce.number().positive("Must be more than 0");
