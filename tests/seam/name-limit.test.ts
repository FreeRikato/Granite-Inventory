import { describe, expect, it } from "vitest";
import { productSchema, supplierSchema, batchSchema } from "@/lib/schemas/batch";
import { customerSchema } from "@/lib/schemas/sale";
import { memberSchema, renameSchema, settingsSchema } from "@/lib/schemas/settings";

const LONG = "x".repeat(81);
const MESSAGE = "Name must be 80 characters or fewer";

describe("name length limit reads as plain words", () => {
  it("refuses an 81-character customer name with the plain message", () => {
    const result = customerSchema.safeParse({ name: LONG, customerType: "CONTRACTOR" });
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
  });

  it("refuses an 81-character product and supplier name with the plain message", () => {
    const product = productSchema.safeParse({ name: LONG, abbreviation: "BP", category: "GRANITE" });
    const supplier = supplierSchema.safeParse({ name: LONG });
    expect(product.success ? [] : product.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
    expect(supplier.success ? [] : supplier.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
  });

  it("refuses an 81-character business name and variant name with the plain message", () => {
    const business = settingsSchema.safeParse({ businessName: LONG });
    const variant = batchSchema.safeParse({ variantName: LONG });
    expect(business.success ? [] : business.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
    expect(variant.success ? [] : variant.error.issues.map((i) => i.message)).toContain(MESSAGE);
  });

  it("refuses an 81-character rename and team-member name with the plain message", () => {
    const rename = renameSchema.safeParse({
      table: "suppliers",
      id: "00000000-0000-4000-8000-000000000000",
      name: LONG,
    });
    const member = memberSchema.safeParse({ email: "a@b.co", name: LONG, role: "YARD_OPERATOR" });
    expect(rename.success ? [] : rename.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
    expect(member.success ? [] : member.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
  });

  it("accepts an empty or whitespace-only team-member name and stores no name", () => {
    for (const blank of ["", "   ", undefined]) {
      const member = memberSchema.safeParse({ email: "a@b.co", name: blank, role: "YARD_OPERATOR" });
      expect(member.success).toBe(true);
      expect(member.data?.name || null).toBeNull();
    }
  });

  it("accepts an 80-character name", () => {
    expect(customerSchema.safeParse({ name: "x".repeat(80), customerType: "CONTRACTOR" }).success).toBe(true);
  });
});
