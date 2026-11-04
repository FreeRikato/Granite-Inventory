"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
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
import { DueBadge } from "@/components/due-badge";
import { describeReceipt, formatDay, isOpen, payByLine, type CreditRow } from "@/lib/credit";
import { describePayments } from "@/lib/payment-split";
import type { PaymentMode } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { BillActions, SaleActions, type BillPayments, type SaleEditLists } from "./sale-actions";

type Sale = Tables<"v_sales">;

export type LaterPayment = {
  readonly id: string;
  readonly paidOn: string;
  readonly lines: readonly { readonly paymentMode: PaymentMode; readonly amount: number }[];
};

type Lead = "date" | "customer";

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

export function SalesTable({
  sales,
  editLists,
  billPayments,
  credit,
  laterPayments,
  lead = "date",
}: {
  readonly sales: readonly Sale[];
  readonly editLists: SaleEditLists | null;
  readonly billPayments: Readonly<Record<string, BillPayments>>;
  readonly credit: ReadonlyMap<string, CreditRow>;
  readonly laterPayments: Readonly<Record<string, readonly LaterPayment[]>>;
  readonly lead?: Lead;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="block w-full text-sm sm:table">
        <thead className="hidden text-left text-xs text-muted-foreground sm:table-header-group">
          <tr>
            <th className="py-2 pr-4 font-medium">{lead === "customer" ? "Customer" : "Date"}</th>
            <th className="py-2 pr-4 font-medium">Stone</th>
            <th className="py-2 pr-4 font-medium">Batch</th>
            <th className="py-2 pr-4 text-right font-medium">Qty</th>
            <th className="py-2 pr-4 text-right font-medium">Total</th>
            <th className="py-2 text-right font-medium">Margin</th>
            {editLists ? (
              <th className="py-2 pl-4">
                <span className="sr-only">Sale actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {groupByBill(sales).map((entry) =>
            entry.kind === "bill" ? (
              <BillRows
                key={entry.billId}
                billId={entry.billId}
                lines={entry.lines}
                editLists={editLists}
                bill={billPayments[entry.billId] ?? null}
                credit={credit.get(entry.billId) ?? null}
                later={laterPayments[entry.billId] ?? []}
                lead={lead}
              />
            ) : (
              <SaleRow key={entry.sale.id} sale={entry.sale} editLists={editLists} lead={lead} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function LeadCell({ sale, lead }: { readonly sale: Sale | undefined; readonly lead: Lead }) {
  return (
    <td className="block py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pr-4 sm:whitespace-nowrap">
      {lead === "customer" ? (
        <>
          <MobileLabel className="mr-2">Customer</MobileLabel>
          <Link href={`/customers/${sale?.customer_id}`} className="font-medium hover:underline">
            {sale?.customer_name}
          </Link>
        </>
      ) : (
        <>
          <MobileLabel className="mr-2">Date</MobileLabel>
          {sale?.sale_date ? formatDate(sale.sale_date) : ""}
        </>
      )}
    </td>
  );
}

function BillRows({
  billId,
  lines,
  editLists,
  bill,
  credit,
  later,
  lead,
}: {
  readonly billId: string;
  readonly lines: readonly Sale[];
  readonly editLists: SaleEditLists | null;
  readonly bill: BillPayments | null;
  readonly credit: CreditRow | null;
  readonly later: readonly LaterPayment[];
  readonly lead: Lead;
}) {
  const [open, setOpen] = useState(false);
  const itemCount = `${lines.length} ${lines.length === 1 ? "item" : "items"}`;
  const total = lines.reduce((sum, line) => sum + (line.revenue ?? 0), 0);

  return (
    <Fragment>
      <tr
        className={cn("block border-t border-border py-2.5 sm:table-row sm:py-0", rowStateClass)}
        data-testid="bill-row"
      >
        <LeadCell sale={lines[0]} lead={lead} />
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
              {credit
                ? bill.payments.length === 0
                  ? "Nothing paid at the sale"
                  : describeReceipt(bill.payments)
                : describePayments(bill.payments)}
            </span>
          ) : null}
          {credit ? <CreditLine credit={credit} later={later} /> : null}
        </td>
        <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
          <MobileLabel className="mr-2 font-sans">Total</MobileLabel>
          {formatRupees(total)}
        </td>
        {editLists ? (
          <td className="flex items-center gap-2 py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pl-4" colSpan={2}>
            <MobileLabel>Actions</MobileLabel>
            <BillActions billId={billId} lines={lines} laterTotal={bill?.laterTotal ?? 0} />
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
              lead={lead}
              nested
            />
          ))
        : null}
    </Fragment>
  );
}

function CreditLine({ credit, later }: { readonly credit: CreditRow; readonly later: readonly LaterPayment[] }) {
  return (
    <span
      className="flex flex-col gap-1 pl-5.5 pt-1 text-xs font-normal text-muted-foreground"
      data-testid="bill-credit"
    >
      {later.map((p) => (
        <span key={p.id} className="tabular">
          {formatDay(p.paidOn)} · {describeReceipt(p.lines)}
        </span>
      ))}
      <span className="flex flex-wrap items-center gap-2 tabular">
        Balance {formatRupees(credit.balance)}
        {isOpen(credit) ? (
          <>
            <DueBadge daysLeft={credit.daysLeft} />
            <span>{payByLine(credit.payBy, credit.originalPayBy)}</span>
          </>
        ) : (
          <span className="font-semibold text-fresh">Paid in full</span>
        )}
      </span>
    </span>
  );
}

function SaleRow({
  sale: s,
  editLists,
  bill = null,
  lead,
  nested = false,
}: {
  readonly sale: Sale;
  readonly editLists: SaleEditLists | null;
  readonly bill?: (BillPayments & { readonly lines: number }) | null;
  readonly lead: Lead;
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
      {nested && lead === "customer" ? (
        <td className="hidden sm:table-cell">
          <span className="sr-only">{s.customer_name}</span>
        </td>
      ) : (
        <LeadCell sale={s} lead={lead} />
      )}
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
