import { describe, expect, it } from "vitest";
import {
  addLine,
  describeOrder,
  orderFigures,
  piecesInCart,
  prefillSplit,
  removeLine,
  splitCovers,
  type CartLine,
} from "@/app/(app)/sell/cart";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    batchId: "batch-old",
    batchCode: "BP-OLD-01",
    productName: "Black Pearl",
    size: "4×2 ft, 16mm",
    lengthFt: 4,
    breadthFt: 2,
    quantity: 2,
    salePrice: 1650,
    landedCost: 1450,
    stickering: null,
    ...overrides,
  };
}

describe("addLine", () => {
  it("adds the quantities when the same batch comes in at the same price", () => {
    const cart = addLine([line({ quantity: 2 })], line({ quantity: 1 }));
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(3);
  });

  it("keeps a second line when the price differs", () => {
    const cart = addLine([line()], line({ salePrice: 1700 }));
    expect(cart.map((l) => l.salePrice)).toEqual([1650, 1700]);
  });

  it("keeps a second line when the batch differs", () => {
    const cart = addLine([line()], line({ batchId: "batch-new", batchCode: "BP-NEW-01" }));
    expect(cart.map((l) => l.batchCode)).toEqual(["BP-OLD-01", "BP-NEW-01"]);
  });

  it("keeps a second line when stickering is added or its amounts differ", () => {
    const withStickering = line({ stickering: { cost: 100, price: 250 } });
    expect(addLine([line()], withStickering)).toHaveLength(2);
    expect(addLine([withStickering], line({ stickering: { cost: 100, price: 300 } }))).toHaveLength(2);
    expect(addLine([withStickering], line({ stickering: { cost: 100, price: 250 }, quantity: 4 }))[0]?.quantity).toBe(
      6,
    );
  });

  it("leaves the cart it was given untouched", () => {
    const cart = [line({ quantity: 2 })];
    addLine(cart, line({ quantity: 1 }));
    expect(cart[0]?.quantity).toBe(2);
  });
});

describe("removeLine and piecesInCart", () => {
  it("removes the line at the index", () => {
    const cart = [line(), line({ batchId: "batch-new", batchCode: "BP-NEW-01" })];
    expect(removeLine(cart, 0).map((l) => l.batchCode)).toEqual(["BP-NEW-01"]);
  });

  it("sums the pieces of one batch across lines", () => {
    const cart = [
      line({ quantity: 2 }),
      line({ quantity: 3, salePrice: 1700 }),
      line({ batchId: "batch-new", quantity: 4 }),
    ];
    expect(piecesInCart(cart, "batch-old")).toBe(5);
    expect(piecesInCart(cart, "batch-new")).toBe(4);
    expect(piecesInCart(cart, null)).toBe(0);
  });
});

describe("prefillSplit", () => {
  it("fills the oldest batch first and puts the rest on the next", () => {
    expect(prefillSplit([14, 30], 20)).toEqual([14, 6]);
  });

  it("takes only what the first batch needs when it covers the quantity", () => {
    expect(prefillSplit([14, 30], 10)).toEqual([10, 0]);
  });

  it("takes nothing from a sold-out batch", () => {
    expect(prefillSplit([0, 30], 1)).toEqual([0, 1]);
    expect(prefillSplit([5, 30], 33)).toEqual([5, 28]);
  });
});

describe("splitCovers", () => {
  it("accepts counts that add up to the quantity within each batch's stock", () => {
    expect(splitCovers([14, 30], [14, 6], 20)).toBe(true);
    expect(splitCovers([14, 30], [0, 20], 20)).toBe(true);
  });

  it("refuses counts that add up to less or more", () => {
    expect(splitCovers([14, 30], [14, 5], 20)).toBe(false);
    expect(splitCovers([14, 30], [14, 7], 20)).toBe(false);
  });

  it("refuses a count above a batch's stock even when the sum is right", () => {
    expect(splitCovers([14, 30], [15, 5], 20)).toBe(false);
  });

  it("refuses negative and fractional counts even when the sum is right", () => {
    expect(splitCovers([14, 30], [-5, 25], 20)).toBe(false);
    expect(splitCovers([14, 30], [13.5, 6.5], 20)).toBe(false);
  });
});

describe("orderFigures", () => {
  it("totals stone, landed cost and margin across lines", () => {
    const cart = [
      line({ quantity: 4, salePrice: 2600, landedCost: 2000 }),
      line({ batchId: "batch-new", quantity: 5, salePrice: 1650, landedCost: 1450 }),
    ];
    const figures = orderFigures(cart);
    expect(figures.stoneTotal).toBe(18650);
    expect(figures.landedTotal).toBe(15250);
    expect(figures.stoneMargin).toBe(3400);
    expect(figures.stickeringMargin).toBe(0);
    expect(figures.margin).toBe(3400);
    expect(figures.marginPct).toBe(18.23);
  });

  it("adds each stickering line's margin to the order total", () => {
    const cart = [
      line({ quantity: 5, salePrice: 1650, landedCost: 1450, stickering: { cost: 100, price: 250 } }),
      line({ batchId: "batch-new", quantity: 2, salePrice: 1000, landedCost: 900 }),
    ];
    const figures = orderFigures(cart);
    expect(figures.stoneTotal).toBe(10250);
    expect(figures.stickeringTotal).toBe(1250);
    expect(figures.stickeringMargin).toBe(750);
    expect(figures.margin).toBe(1000 + 200 + 750);
    expect(figures.revenue).toBe(11500);
  });

  it("reads an empty order as zeros with no percentage", () => {
    const figures = orderFigures([]);
    expect(figures.margin).toBe(0);
    expect(figures.marginPct).toBeNull();
  });
});

describe("describeOrder", () => {
  it("counts lines and pieces and uses the singular for one", () => {
    expect(describeOrder([line({ quantity: 1 })])).toBe("1 line · 1 piece");
    expect(describeOrder([line({ quantity: 4 }), line({ batchId: "batch-new", quantity: 5 })])).toBe(
      "2 lines · 9 pieces",
    );
  });
});
