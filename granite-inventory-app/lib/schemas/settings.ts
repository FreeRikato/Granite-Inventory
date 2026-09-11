import { z } from "zod";

/* Partial update: each field optional so a page can save just the ones it owns. */
export const settingsSchema = z
  .object({
    businessName: z.string().trim().min(1, "Name is required").max(80),
    tagline: z.string().trim().max(120),
    ageingAfterDays: z.coerce.number().int().positive("Must be at least 1 day"),
    staleAfterDays: z.coerce.number().int().positive("Must be at least 1 day"),
    catalogPublic: z.boolean(),
    whatsappNumber: z
      .string()
      .trim()
      .regex(/^(\+?[0-9 ]{6,20})?$/, "Enter a valid phone number"),
  })
  .partial()
  .refine(
    (s) => s.ageingAfterDays === undefined || s.staleAfterDays === undefined || s.ageingAfterDays < s.staleAfterDays,
    { message: "Ageing must come before Stale", path: ["staleAfterDays"] },
  );

export type SettingsInput = z.infer<typeof settingsSchema>;
