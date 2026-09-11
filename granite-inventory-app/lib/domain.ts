/* Vocabulary from CONTEXT.md as code. Values match the check constraints in the migrations. */

export const CATEGORIES = ["GRANITE", "MEMORIAL", "TILES"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  GRANITE: "Granite",
  MEMORIAL: "Doom Stone",
  TILES: "Tiles",
};

export const SLOTS = ["4FT", "5FT", "DOOM", "CUSTOM"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = {
  "4FT": "4 ft Slot",
  "5FT": "5 ft Slot",
  DOOM: "Doom Stones",
  CUSTOM: "Custom",
};

export const CUSTOMER_TYPES = ["REGULAR", "CONTRACTOR", "ENGINEER", "TRUST", "RETAIL"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  REGULAR: "Regular",
  CONTRACTOR: "Contractor",
  ENGINEER: "Engineer",
  TRUST: "Trust",
  RETAIL: "Walk-in",
};

export const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
};

export const AGEING_BANDS = ["FRESH", "AGEING", "STALE"] as const;
export type AgeingBand = (typeof AGEING_BANDS)[number];

export function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}
export function isSlot(value: unknown): value is Slot {
  return SLOTS.includes(value as Slot);
}
export function isCustomerType(value: unknown): value is CustomerType {
  return CUSTOMER_TYPES.includes(value as CustomerType);
}
export function isAgeingBand(value: unknown): value is AgeingBand {
  return AGEING_BANDS.includes(value as AgeingBand);
}

/* Mirrors public.suggest_slot() so the form can preview before saving. */
export function suggestSlot(category: Category, lengthFt: number | null): Slot {
  if (category === "MEMORIAL") return "DOOM";
  if (lengthFt !== null && lengthFt >= 4 && lengthFt < 5) return "4FT";
  if (lengthFt !== null && lengthFt >= 5 && lengthFt < 6) return "5FT";
  return "CUSTOM";
}

/* Initials of a product name, e.g. "Black Pearl" -> "BP", "G20" -> "G20". */
export function suggestAbbreviation(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
}
