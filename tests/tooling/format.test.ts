import { describe, expect, it } from "vitest";
import { formatArea, formatRupees, formatRupeesCompact } from "@/lib/format";

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

describe("formatArea", () => {
  it("multiplies length by breadth without floating point noise", () => {
    expect(formatArea("6", "2")).toBe("12");
    expect(formatArea("4.25", "2.75")).toBe("11.6875");
    expect(formatArea("2.33", "3.1")).toBe("7.223");
  });

  it("rounds each side to two places the way the size columns store it", () => {
    expect(formatArea("2.335", "3")).toBe("7.02");
    expect(formatArea("2.333", "3.1")).toBe("7.223");
  });

  it("stays empty until both sides are above zero", () => {
    expect(formatArea("", "2")).toBe("");
    expect(formatArea("6", "0")).toBe("");
    expect(formatArea("abc", "2")).toBe("");
  });
});
