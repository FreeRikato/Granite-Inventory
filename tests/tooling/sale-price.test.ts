import { describe, expect, it } from "vitest";
import { pieceArea, salePricePerPiece } from "@/lib/sale-price";

describe("pieceArea", () => {
  it("multiplies length by breadth", () => {
    expect(pieceArea(4, 2)).toBe(8);
    expect(pieceArea(4.5, 2.25)).toBe(10.125);
  });

  it("drops the float noise of the product", () => {
    expect(pieceArea(1.1, 1.1)).toBe(1.21);
  });

  it("has no Area without a size", () => {
    expect(pieceArea(null, null)).toBeNull();
    expect(pieceArea(4, null)).toBeNull();
    expect(pieceArea(null, 2)).toBeNull();
  });
});

describe("salePricePerPiece", () => {
  it("multiplies Area by the rate", () => {
    expect(salePricePerPiece(8, 250)).toBe(2000);
  });

  it("rounds to paise", () => {
    expect(salePricePerPiece(10.125, 33.33)).toBe(337.47);
  });

  it("rounds a half paise up, as Postgres does, despite float noise", () => {
    expect(salePricePerPiece(1, 1.005)).toBe(1.01);
    expect(salePricePerPiece(1.005, 1)).toBe(1.01);
  });

  it("takes the rate as the price for a Memorial, which has no Area", () => {
    expect(salePricePerPiece(null, 2000)).toBe(2000);
  });

  it("is zero at a zero rate", () => {
    expect(salePricePerPiece(8, 0)).toBe(0);
  });
});
