import Link from "next/link";
import { formatSqft } from "@/lib/format";
import type { CustomerSqft } from "@/lib/query/reads";

export function CustomerSquareFeet({ rows }: { readonly rows: readonly CustomerSqft[] }) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold">Square feet by Customer</h2>
      <p className="mt-1 text-xs text-muted-foreground">Memorial has no Size, so it is not counted.</p>
      <ul className="mt-3 flex flex-col text-sm">
        {rows.map((row) => (
          <li
            key={row.customer_id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border py-3.5"
            data-testid="customer-sqft"
          >
            <Link href={`/customers/${row.customer_id}`} className="min-w-0 font-medium hover:underline">
              {row.customer_name}
            </Link>
            {row.sqft === null ? (
              <span className="text-muted-foreground">Memorial only</span>
            ) : (
              <span className="tabular">{formatSqft(row.sqft)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
