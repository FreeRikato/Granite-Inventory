import { computeMargin, type MarginBreakdown } from "@/lib/margin";

export type CartLine = {
  readonly batchId: string;
  readonly batchCode: string;
  readonly productName: string;
  readonly size: string;
  readonly lengthFt: number | null;
  readonly breadthFt: number | null;
  readonly quantity: number;
  readonly salePrice: number;
  readonly landedCost: number;
  readonly stickering: { readonly cost: number; readonly price: number } | null;
};

function sameStickering(a: CartLine["stickering"], b: CartLine["stickering"]): boolean {
  if (a === null || b === null) return a === b;
  return a.cost === b.cost && a.price === b.price;
}

function isSameLine(a: CartLine, b: CartLine): boolean {
  return a.batchId === b.batchId && a.salePrice === b.salePrice && sameStickering(a.stickering, b.stickering);
}

export function addLine(cart: readonly CartLine[], line: CartLine): readonly CartLine[] {
  const index = cart.findIndex((existing) => isSameLine(existing, line));
  if (index === -1) return [...cart, line];
  return cart.map((existing, i) =>
    i === index ? { ...existing, quantity: existing.quantity + line.quantity } : existing,
  );
}

export function removeLine(cart: readonly CartLine[], index: number): readonly CartLine[] {
  return cart.filter((_, i) => i !== index);
}

export function piecesInCart(cart: readonly CartLine[], batchId: string | null): number {
  return cart.reduce((sum, line) => (line.batchId === batchId ? sum + line.quantity : sum), 0);
}

export function prefillSplit(availables: readonly number[], quantity: number): readonly number[] {
  let left = quantity;
  return availables.map((available) => {
    const take = Math.min(available, left);
    left -= take;
    return take;
  });
}

export function splitCovers(availables: readonly number[], takes: readonly number[], quantity: number): boolean {
  const withinStock = takes.every((take, i) => Number.isInteger(take) && take >= 0 && take <= (availables[i] ?? 0));
  return withinStock && takes.reduce((sum, take) => sum + take, 0) === quantity;
}

export function orderFigures(cart: readonly CartLine[]): MarginBreakdown {
  const lines = cart.map(computeMargin);
  const sum = (pick: (m: MarginBreakdown) => number) => lines.reduce((total, m) => total + pick(m), 0);
  const stickeringCost = cart.reduce((total, l) => total + (l.stickering ? l.quantity * l.stickering.cost : 0), 0);
  return computeMargin({
    quantity: 1,
    salePrice: sum((m) => m.stoneTotal),
    landedCost: sum((m) => m.landedTotal),
    stickering: cart.some((l) => l.stickering) ? { cost: stickeringCost, price: sum((m) => m.stickeringTotal) } : null,
  });
}

export function describeOrder(cart: readonly CartLine[]): string {
  const pieces = cart.reduce((sum, line) => sum + line.quantity, 0);
  return `${cart.length} ${cart.length === 1 ? "line" : "lines"} · ${pieces} ${pieces === 1 ? "piece" : "pieces"}`;
}
