import { z } from "zod";

const TOO_LARGE = "Number is too large";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const money = z.coerce.number().min(0, "Cannot be negative").lt(1e10, TOO_LARGE);
export const positiveNumber = z.coerce.number().positive("Must be more than 0").lt(1000, TOO_LARGE);
export const positiveInteger = (positive: string) => z.coerce.number().int().positive(positive).max(1_000_000, TOO_LARGE);
