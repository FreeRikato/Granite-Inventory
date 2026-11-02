"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { arrangeCredit, creditTotals, matchesCredit, type CreditRow, type CreditView } from "@/lib/credit";
import type { CreditReceipt } from "@/lib/query/reads";
import { formatNumber, formatRupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreditCard } from "./credit-card";
import { ExtendDialog } from "./extend-dialog";
import { ReceiptDialog } from "./receipt-dialog";

type Dialog =
  | { readonly kind: "record"; readonly row: CreditRow }
  | { readonly kind: "edit"; readonly row: CreditRow; readonly receipt: CreditReceipt }
  | { readonly kind: "extend"; readonly row: CreditRow };

const VIEWS: readonly { readonly id: CreditView; readonly label: string }[] = [
  { id: "overdue", label: "Overdue first" },
  { id: "pay-by", label: "Pay-by date" },
  { id: "paid", label: "Paid" },
];

export function CreditList({ rows, isAdmin }: { readonly rows: readonly CreditRow[]; readonly isAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CreditView>("overdue");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const totals = creditTotals(rows);
  const visible = useMemo(() => arrangeCredit(rows, view).filter((r) => matchesCredit(r, query)), [rows, view, query]);
  const live = dialog === null ? null : (rows.find((r) => r.billId === dialog.row.billId) ?? null);

  return (
    <>
      <dl className="flex divide-x divide-border">
        <Kpi label="Outstanding" value={formatRupees(totals.outstanding)} />
        <Kpi label="Bills on credit" value={formatNumber(totals.bills)} />
        <Kpi label="Overdue" value={formatNumber(totals.overdue)} />
      </dl>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone..."
          className="h-10 rounded-full bg-card pl-9"
          aria-label="Search credit"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Order">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium",
              view === v.id
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card bg-card py-10 text-center text-sm text-muted-foreground shadow-sm">
          {emptyText(view, query)}
        </p>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {visible.map((row) => (
            <li key={row.billId} className="min-w-0">
              <CreditCard
                row={row}
                isAdmin={isAdmin}
                onRecord={() => setDialog({ kind: "record", row })}
                onExtend={() => setDialog({ kind: "extend", row })}
                onEdit={(receipt) => setDialog({ kind: "edit", row, receipt })}
              />
            </li>
          ))}
        </ul>
      )}

      {dialog && live && dialog.kind !== "extend" ? (
        <ReceiptDialog
          key={dialog.kind === "edit" ? dialog.receipt.id : live.billId}
          row={live}
          receipt={dialog.kind === "edit" ? dialog.receipt : null}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog && live && dialog.kind === "extend" ? (
        <ExtendDialog key={live.billId} row={live} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

function emptyText(view: CreditView, query: string): string {
  if (query.trim()) return "No Bills match.";
  return view === "paid" ? "No Bill has been paid off yet." : "Nothing is owed. Every credit Bill is settled.";
}

function Kpi({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1 pr-6 pl-6 first:pl-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular">{value}</dd>
    </div>
  );
}
