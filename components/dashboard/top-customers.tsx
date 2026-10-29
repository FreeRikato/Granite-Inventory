import Link from "next/link";
import { formatNumber, formatRupeesCompact } from "@/lib/format";

export type TopCustomerRow = {
  readonly customer_id: string;
  readonly customer_name: string;
  readonly billed: number;
  readonly products: readonly { readonly name: string; readonly pieces: number }[];
};

const SHOWN_PRODUCTS = 3;

export function TopCustomers({
  rows,
  emptyMessage,
}: {
  readonly rows: readonly TopCustomerRow[];
  readonly emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.billed));
  return (
    <ol className="flex flex-col gap-4" aria-label="Top customers by billed amount">
      {rows.map((r) => {
        const shown = r.products.slice(0, SHOWN_PRODUCTS);
        const more = r.products.length - shown.length;
        return (
          <li key={r.customer_id} className="flex flex-col gap-1.5 text-sm" data-testid="top-customer-row">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/customers/${r.customer_id}`}
                className="min-w-0 truncate font-semibold hover:underline"
                data-testid="top-customer-link"
              >
                {r.customer_name}
              </Link>
              <span className="font-semibold tabular" data-testid="top-customer-billed">
                {formatRupeesCompact(r.billed)}
              </span>
            </div>
            <span className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(3, (r.billed / max) * 100)}%` }}
              />
            </span>
            <span className="break-words text-xs text-muted-foreground" data-testid="top-customer-products">
              {shown.map((p) => `${p.name} ${formatNumber(p.pieces)} pcs`).join(" · ")}
              {more > 0 ? ` · +${more} more` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
