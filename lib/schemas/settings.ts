import { z } from "zod";
import { CATEGORIES, ROLES } from "@/lib/domain";
import { name, optionalName } from "./common";

export const settingsSchema = z
  .object({
    businessName: name,
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

export const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a Google email"),
  name: optionalName,
  role: z.enum(ROLES),
});

export const renameSchema = z.object({
  table: z.enum(["products", "suppliers"]),
  id: z.string().uuid(),
  name,
  abbreviation: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,4}$/, "1 to 4 letters or digits")
    .optional(),
  category: z.enum(CATEGORIES).optional(),
});
