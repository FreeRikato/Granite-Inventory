"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import {
  formatDate,
  formatPercent,
  formatRupees,
  formatSaleLine,
  formatSize,
  formatStickeringLine,
} from "@/lib/format";
import { rowStateClass } from "@/lib/query/row-style";
import { describePayments } from "@/lib/payment-split";
import { cn } from "@/lib/utils";
import { BillActions, SaleActions, type BillPayments, type SaleEditLists } from "./sale-actions";

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
  billPayments,
}: {
  readonly sales: readonly Sale[];
  readonly editLists: SaleEditLists | null;
  readonly billPayments: Readonly<Record<string, BillPayments>>;
}) {
  return groupByBill(sales).map((entry) =>
    entry.kind === "bill" ? (
      <BillRows
        key={entry.billId}
        billId={entry.billId}
        lines={entry.lines}
        editLists={editLists}
        bill={billPayments[entry.billId] ?? null}
      />
    ) : (
      <SaleRow key={entry.sale.id} sale={entry.sale} editLists={editLists} />
    ),
  );
}

function BillRows({
  billId,
  lines,
  editLists,
  bill,
}: {
  readonly billId: string;
  readonly lines: readonly Sale[];
  readonly editLists: SaleEditLists | null;
  readonly bill: BillPayments | null;
}) {
  const [open, setOpen] = useState(false);
  const itemCount = `${lines.length} ${lines.length === 1 ? "item" : "items"}`;
  const total = lines.reduce((sum, line) => sum + (line.revenue ?? 0), 0);
  const date = lines[0]?.sale_date;

  return (
    <Fragment>
      <tr
        className={cn("block border-t border-border py-2.5 sm:table-row sm:py-0", rowStateClass)}
        data-testid="bill-row"
      >
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
          {bill ? (
            <span
              className="block pl-5.5 text-xs font-normal text-muted-foreground tabular"
              data-testid="bill-payments"
            >
              {describePayments(bill.payments)}
            </span>
          ) : null}
        </td>
        <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
          <MobileLabel className="mr-2 font-sans">Total</MobileLabel>
          {formatRupees(total)}
        </td>
        {editLists ? (
          <td className="flex items-center gap-2 py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pl-4" colSpan={2}>
            <MobileLabel>Actions</MobileLabel>
            <BillActions billId={billId} lines={lines} />
          </td>
        ) : null}
      </tr>
      {open
        ? lines.map((line) => (
            <SaleRow
              key={line.id}
              sale={line}
              editLists={editLists}
              bill={bill ? { ...bill, lines: lines.length } : null}
              nested
            />
          ))
        : null}
    </Fragment>
  );
}

function SaleRow({
  sale: s,
  editLists,
  bill = null,
  nested = false,
}: {
  readonly sale: Sale;
  readonly editLists: SaleEditLists | null;
  readonly bill?: (BillPayments & { readonly lines: number }) | null;
  readonly nested?: boolean;
}) {
  return (
    <tr
      className={cn(
        "block border-t border-border py-2.5 sm:table-row sm:py-0",
        rowStateClass,
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
        <SaleWorking sale={s} />
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
          <SaleActions sale={s} lists={editLists} bill={bill} />
        </td>
      ) : null}
    </tr>
  );
}

function SaleWorking({ sale }: { readonly sale: Sale }) {
  if (sale.quantity === null || sale.sale_rate === null || sale.stone_total === null) return null;
  return (
    <>
      <span className="block text-xs font-normal text-muted-foreground tabular">
        {formatSaleLine({
          quantity: sale.quantity,
          areaSqft: sale.area_sqft,
          saleRate: sale.sale_rate,
          stoneTotal: sale.stone_total,
        })}
      </span>
      {sale.has_stickering && sale.stickering_rate !== null && sale.stickering_total !== null ? (
        <span className="block text-xs font-normal text-muted-foreground tabular" data-testid="stickering-working">
          Stickering{" "}
          {formatStickeringLine({
            quantity: sale.quantity,
            areaSqft: sale.area_sqft,
            stickeringRate: sale.stickering_rate,
            stickeringTotal: sale.stickering_total,
          })}
        </span>
      ) : null}
    </>
  );
}

function MobileLabel({ children, className }: { children: string; className?: string }) {
  return <span className={cn("text-xs font-medium text-muted-foreground sm:hidden", className)}>{children}</span>;
}
