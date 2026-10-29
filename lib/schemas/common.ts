import { z } from "zod";

const TOO_LARGE = "Number is too large";

export const NAME_MAX = 80;

const nameTooLong = z.string().trim().max(NAME_MAX, `Name must be ${NAME_MAX} characters or fewer`);

export const name = nameTooLong.min(1, "Name is required");
export const optionalName = nameTooLong.optional();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const money = (label: string) => z.coerce.number().min(0, `${label} cannot be negative`).lt(1e10, TOO_LARGE);
export const requiredMoney = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: `${label} is required` })
      .min(0, `${label} cannot be negative`)
      .lt(1e10, TOO_LARGE),
  );
export const positiveNumber = z.coerce.number().positive("Must be more than 0").lt(1000, TOO_LARGE);
export const positiveInteger = (positive: string) =>
  z.coerce.number().int().positive(positive).max(1_000_000, TOO_LARGE);
