import { z } from "zod";

/* Upper bounds match the columns (numeric(12, 2) for money, numeric(5, 2) for sizes, a practical
   cap for counts and thickness), so an oversized number is refused here with readable copy instead
   of reaching Postgres as a 22003 overflow. */
const TOO_LARGE = "Number is too large";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const money = z.coerce.number().min(0, "Cannot be negative").lt(1e10, TOO_LARGE);
export const positiveNumber = z.coerce.number().positive("Must be more than 0").lt(1000, TOO_LARGE);
export const positiveInteger = (positive: string) => z.coerce.number().int().positive(positive).max(1_000_000, TOO_LARGE);
