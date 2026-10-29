import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { DonutRing, StockDonut } from "@/components/dashboard/stock-donut";

function ringData(node: ReactNode): unknown {
  if (!isValidElement<{ children?: ReactNode; data?: unknown }>(node)) return undefined;
  if (node.type === DonutRing) return node.props.data;
  for (const child of Children.toArray(node.props.children)) {
    const found = ringData(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("StockDonut", () => {
  it("draws the empty ring in the sold colour", () => {
    expect(ringData(StockDonut({ active: 0, sold: 0 }))).toEqual([
      { key: "sold", value: 1, fill: "var(--color-sold)" },
    ]);
  });

  it("draws both slices once there is stock or sales", () => {
    expect(ringData(StockDonut({ active: 3, sold: 1 }))).toEqual([
      { key: "active", value: 3, fill: "var(--color-active)" },
      { key: "sold", value: 1, fill: "var(--color-sold)" },
    ]);
  });
});
