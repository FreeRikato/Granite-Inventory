import Link from "next/link";
import { describeReceipt, formatDay } from "@/lib/credit";
import { formatRupees } from "@/lib/format";
import type { DayReceipt } from "@/lib/query/reads";

export function LaterPayments({ receipts }: { readonly receipts: readonly DayReceipt[] }) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold">Later payments</h2>
      <ul className="mt-3 flex flex-col text-sm">
        {receipts.map((receipt) => (
          <li
            key={receipt.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border py-2.5"
            data-testid="later-payment"
          >
            <span className="min-w-0">
              <Link href={`/customers/${receipt.customerId}`} className="font-medium hover:underline">
                {receipt.customerName}
              </Link>
              <span className="block text-xs text-muted-foreground tabular">
                Bill of {formatDay(receipt.saleDate)} · {describeReceipt(receipt.lines)}
              </span>
            </span>
            <span className="tabular">{formatRupees(receipt.lines.reduce((sum, l) => sum + l.amount, 0))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
