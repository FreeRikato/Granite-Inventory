import { PAYMENT_MODE_LABEL, isPaymentMode } from "@/lib/domain";
import { formatPercent, formatRupees } from "@/lib/format";
import type { PaymentModeRow } from "@/lib/query/reads";

const UNPAID = "UNPAID";

function label(mode: string): string {
  if (mode === UNPAID) return "Unpaid";
  return isPaymentMode(mode) ? PAYMENT_MODE_LABEL[mode] : mode;
}

export function PaymentTable({ rows: all }: { readonly rows: readonly PaymentModeRow[] }) {
  const rows = all.filter((r) => r.payment_mode !== UNPAID || r.collected !== 0 || r.margin !== 0);
  const collected = rows.reduce((sum, r) => sum + r.collected, 0);
  const margin = rows.reduce((sum, r) => sum + r.margin, 0);
  const share = (value: number) => (margin > 0 && value > 0 ? (value / margin) * 100 : null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular" data-testid="payment-table">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-4 text-left font-medium">Payment mode</th>
            <th className="py-2 pr-4 text-right font-medium">Collected</th>
            <th className="py-2 pr-4 text-right font-medium">Margin</th>
            <th className="py-2 pr-4 text-right font-medium">Margin %</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">Share of margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = share(r.margin);
            return (
              <tr key={r.payment_mode} className="border-b border-border" data-testid="payment-row">
                <td className="py-3 pr-4 font-medium">{label(r.payment_mode)}</td>
                <td className="py-3 pr-4 text-right">{formatRupees(r.collected)}</td>
                <td className="py-3 pr-4 text-right">{formatRupees(r.margin)}</td>
                <td className="py-3 pr-4 text-right text-muted-foreground">
                  {r.margin_pct === null ? "" : formatPercent(r.margin_pct)}
                </td>
                <td className="hidden py-3 sm:table-cell">
                  {pct === null ? null : (
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-10 text-right text-muted-foreground">{Math.round(pct)}%</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="font-semibold" data-testid="payment-total">
            <td className="pt-3 pr-4">Total</td>
            <td className="pt-3 pr-4 text-right">{formatRupees(collected)}</td>
            <td className="pt-3 pr-4 text-right">{formatRupees(margin)}</td>
            <td className="pt-3 pr-4 text-right">{collected > 0 ? formatPercent((margin / collected) * 100) : ""}</td>
            <td className="hidden sm:table-cell" aria-hidden="true" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
