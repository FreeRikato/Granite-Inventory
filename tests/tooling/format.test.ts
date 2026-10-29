import { describe, expect, it } from "vitest";
import { formatRupees, formatRupeesAxis, formatRupeesCompact } from "@/lib/format";

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

describe("formatRupeesAxis", () => {
  it("writes thousands as K, lakhs as L and crores as Cr", () => {
    expect(formatRupeesAxis(0)).toBe("₹0");
    expect(formatRupeesAxis(999)).toBe("₹999");
    expect(formatRupeesAxis(25000)).toBe("₹25K");
    expect(formatRupeesAxis(75000)).toBe("₹75K");
    expect(formatRupeesAxis(100000)).toBe("₹1L");
    expect(formatRupeesAxis(150000)).toBe("₹1.5L");
    expect(formatRupeesAxis(10000000)).toBe("₹1Cr");
  });

  it("puts the sign of a negative amount before the symbol", () => {
    expect(formatRupeesAxis(-3000)).toBe("-₹3K");
    expect(formatRupeesAxis(-150000)).toBe("-₹1.5L");
  });
});
