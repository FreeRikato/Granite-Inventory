import { describe, expect, it } from "vitest";
import { formatRupees, formatRupeesCompact } from "@/lib/format";

describe("formatRupees", () => {
  it("puts the sign of a negative amount before the symbol", () => {
    expect(formatRupees(-5050)).toBe("-₹5,050");
    expect(formatRupees(5050)).toBe("₹5,050");
    expect(formatRupees(0)).toBe("₹0");
  });
});

describe("formatRupeesCompact", () => {
  it("puts the sign before the symbol in the lakh and crore forms", () => {
    expect(formatRupeesCompact(-250000)).toBe("-₹2.5L");
    expect(formatRupeesCompact(-25000000)).toBe("-₹2.5Cr");
    expect(formatRupeesCompact(-5050)).toBe("-₹5,050");
    expect(formatRupeesCompact(250000)).toBe("₹2.5L");
  });
});
