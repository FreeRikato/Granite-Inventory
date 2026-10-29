"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { formatDate, formatPercent, formatRupees, formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SaleActions, type SaleEditLists } from "./sale-actions";

type Sale = Tables<"v_sales">;

type Entry =
  | { readonly kind: "sale"; readonly sale: Sale }
  | { readonly kind: "bill"; readonly billId: string; readonly lines: Sale[] };

function groupByBill(sales: readonly Sale[]): readonly Entry[] {
  const entries: Entry[] = [];
  const bills = new Map<string, Sale[]>();
  for (const sale of sales) {
    if (!sale.bill_id) {
      entries.push({ kind: "sale", sale });
      continue;
    }
    const lines = bills.get(sale.bill_id);
    if (lines) {
      lines.push(sale);
      continue;
    }
    const first = [sale];
    bills.set(sale.bill_id, first);
    entries.push({ kind: "bill", billId: sale.bill_id, lines: first });
  }
  return entries;
}

export function SalesRows({
  sales,
  editLists,
}: {
  readonly sales: readonly Sale[];
  readonly editLists: SaleEditLists | null;
}) {
  return groupByBill(sales).map((entry) =>
    entry.kind === "bill" ? (
      <BillRows key={entry.billId} lines={entry.lines} editLists={editLists} />
    ) : (
      <SaleRow key={entry.sale.id} sale={entry.sale} editLists={editLists} />
    ),
  );
}

function BillRows({ lines, editLists }: { readonly lines: readonly Sale[]; readonly editLists: SaleEditLists | null }) {
  const [open, setOpen] = useState(false);
  const itemCount = `${lines.length} ${lines.length === 1 ? "item" : "items"}`;
  const total = lines.reduce((sum, line) => sum + (line.revenue ?? 0), 0);
  const date = lines[0]?.sale_date;

  return (
    <Fragment>
      <tr className="block border-t border-border py-2.5 sm:table-row sm:py-0" data-testid="bill-row">
        <td className="block py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pr-4 sm:whitespace-nowrap">
          <MobileLabel className="mr-2">Date</MobileLabel>
          {date ? formatDate(date) : ""}
        </td>
        <td className="block py-1.5 pr-0 font-medium sm:table-cell sm:py-2.5 sm:pr-4" colSpan={3}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-sm text-left font-medium hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={itemCount}
            aria-expanded={open}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
            {itemCount}
          </button>
        </td>
        <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
          <MobileLabel className="mr-2 font-sans">Total</MobileLabel>
          {formatRupees(total)}
        </td>
      </tr>
      {open ? lines.map((line) => <SaleRow key={line.id} sale={line} editLists={editLists} nested />) : null}
    </Fragment>
  );
}

function SaleRow({
  sale: s,
  editLists,
  nested = false,
}: {
  readonly sale: Sale;
  readonly editLists: SaleEditLists | null;
  readonly nested?: boolean;
}) {
  return (
    <tr
      className={cn(
        "block border-t border-border py-2.5 sm:table-row sm:py-0",
        nested && "bg-muted/40 [&>td:first-child]:pl-6",
      )}
      data-testid="sale-row"
    >
      <td className="block py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pr-4 sm:whitespace-nowrap">
        <MobileLabel className="mr-2">Date</MobileLabel>
        {s.sale_date ? formatDate(s.sale_date) : ""}
      </td>
      <td className="block py-1.5 pr-0 font-medium sm:table-cell sm:py-2.5 sm:pr-4">
        <MobileLabel className="mr-2">Stone</MobileLabel>
        {s.product_name}
        <span className="block text-xs font-normal text-muted-foreground">
          {formatSize({ length_ft: s.length_ft, breadth_ft: s.breadth_ft, thickness_mm: s.thickness_mm })}
          {s.has_stickering ? " · with stickering" : ""}
        </span>
      </td>
      <td className="block py-1.5 pr-0 font-mono text-xs sm:table-cell sm:py-2.5 sm:pr-4">
        <MobileLabel className="mr-2 font-sans">Batch</MobileLabel>
        {s.batch_code}
      </td>
      <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
        <MobileLabel className="mr-2 font-sans">Qty</MobileLabel>
        {s.quantity}
      </td>
      <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
        <MobileLabel className="mr-2 font-sans">Total</MobileLabel>
        {formatRupees(s.revenue ?? 0)}
      </td>
      <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:text-right">
        <MobileLabel className="mr-2 font-sans">Margin</MobileLabel>
        {formatRupees(s.margin ?? 0)}
        {s.margin_pct !== null ? (
          <span className="ml-1 text-xs text-muted-foreground">({formatPercent(s.margin_pct)})</span>
        ) : null}
      </td>
      {editLists ? (
        <td className="flex items-center gap-2 py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pl-4">
          <MobileLabel>Actions</MobileLabel>
          <SaleActions sale={s} lists={editLists} />
        </td>
      ) : null}
    </tr>
  );
}

function MobileLabel({ children, className }: { children: string; className?: string }) {
  return <span className={cn("text-xs font-medium text-muted-foreground sm:hidden", className)}>{children}</span>;
}
