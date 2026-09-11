/* Margin math mirrored from v_sales so the Sell form can show it live before saving.
   Misc expense is tracked but never part of margin. */
export type SaleFigures = {
  readonly quantity: number;
  readonly salePrice: number;
  readonly landedCost: number;
  readonly stickering: { readonly cost: number; readonly price: number } | null;
  readonly miscExpense: number;
};

export type MarginBreakdown = {
  readonly stoneTotal: number;
  readonly landedTotal: number;
  readonly stoneMargin: number;
  readonly stickeringTotal: number;
  readonly stickeringMargin: number;
  readonly revenue: number;
  readonly margin: number;
  readonly marginPct: number | null;
};

export function computeMargin(f: SaleFigures): MarginBreakdown {
  const q = Math.max(0, f.quantity);
  const stoneTotal = q * f.salePrice;
  const landedTotal = q * f.landedCost;
  const stoneMargin = stoneTotal - landedTotal;
  const stickeringTotal = f.stickering ? q * f.stickering.price : 0;
  const stickeringMargin = f.stickering ? q * (f.stickering.price - f.stickering.cost) : 0;
  const revenue = stoneTotal + stickeringTotal;
  const margin = stoneMargin + stickeringMargin;
  return {
    stoneTotal,
    landedTotal,
    stoneMargin,
    stickeringTotal,
    stickeringMargin,
    revenue,
    margin,
    marginPct: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : null,
  };
}

/* Green above 25 percent, red below 10, amber between (from the meeting brief). */
export function marginHealth(pct: number | null): "good" | "ok" | "bad" | "none" {
  if (pct === null) return "none";
  if (pct > 25) return "good";
  if (pct < 10) return "bad";
  return "ok";
}
