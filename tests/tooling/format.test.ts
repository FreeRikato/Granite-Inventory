import { describe, expect, it } from "vitest";
import {
  formatArea,
  formatAreaTotal,
  formatRate,
  formatRupees,
  formatRupeesAxis,
  formatRupeesCompact,
  formatSaleLine,
} from "@/lib/format";

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

describe("formatAreaTotal", () => {
  it("multiplies the per piece area by the quantity", () => {
    expect(formatAreaTotal("4", "2", 5)).toBe("40");
    expect(formatAreaTotal("4.25", "2.75", 3)).toBe("35.0625");
  });

  it("stays empty without a size or a whole number of pieces above zero", () => {
    expect(formatAreaTotal("", "", 5)).toBe("");
    expect(formatAreaTotal("4", "2", 0)).toBe("");
    expect(formatAreaTotal("4", "2", 2.5)).toBe("");
    expect(formatAreaTotal("4", "2", Number.NaN)).toBe("");
  });
});

describe("formatRate", () => {
  it("shows up to two decimals and none when whole", () => {
    expect(formatRate(250)).toBe("₹250");
    expect(formatRate(33.33)).toBe("₹33.33");
    expect(formatRate(183.3333333333)).toBe("₹183.33");
    expect(formatRate(206.25)).toBe("₹206.25");
    expect(formatRate(1250)).toBe("₹1,250");
  });
});

describe("formatSaleLine", () => {
  it("writes quantity, Area, rate per sq ft and the stone total for sized stone", () => {
    expect(formatSaleLine({ quantity: 10, areaSqft: 8, saleRate: 250, stoneTotal: 20000, stickeringPrice: null })).toBe(
      "10 × 8 sq ft × ₹250/sq ft = ₹20,000",
    );
  });

  it("keeps up to four decimals of Area and rounds the total to whole rupees", () => {
    expect(
      formatSaleLine({ quantity: 1, areaSqft: 10.125, saleRate: 33.33, stoneTotal: 337.46, stickeringPrice: null }),
    ).toBe("1 × 10.125 sq ft × ₹33.33/sq ft = ₹337");
  });

  it("writes a Memorial line per piece", () => {
    expect(
      formatSaleLine({ quantity: 10, areaSqft: null, saleRate: 2000, stoneTotal: 20000, stickeringPrice: null }),
    ).toBe("10 × ₹2,000 = ₹20,000");
  });

  it("takes the total as given and appends the stickering price after it", () => {
    expect(formatSaleLine({ quantity: 10, areaSqft: 8, saleRate: 250, stoneTotal: 19999, stickeringPrice: 300 })).toBe(
      "10 × 8 sq ft × ₹250/sq ft = ₹19,999 + ₹300 stickering",
    );
  });
});
