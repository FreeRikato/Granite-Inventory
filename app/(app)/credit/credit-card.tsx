"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { initialsOf } from "@/components/customer-type-badge";
import { DueBadge, ExtendedTag } from "@/components/due-badge";
import { useCanWrite } from "@/components/shell/member-provider";
import { Button } from "@/components/ui/button";
import { isOpen, payByLine, formatDay, type CreditRow } from "@/lib/credit";
import { formatRupees } from "@/lib/format";
import type { CreditReceipt } from "@/lib/query/reads";
import { cn } from "@/lib/utils";
import { PaymentsList } from "./payments-list";

type Props = {
  readonly row: CreditRow;
  readonly isAdmin: boolean;
  readonly onRecord: () => void;
  readonly onExtend: () => void;
  readonly onEdit: (receipt: CreditReceipt) => void;
};

export function CreditCard({ row, isAdmin, onRecord, onExtend, onEdit }: Props) {
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const share = row.total > 0 ? Math.min(100, (row.paid / row.total) * 100) : 0;
  const settled = !isOpen(row);

  return (
    <article className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm" data-testid="credit-card">
      <header className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
          {initialsOf(row.customerName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={`/customers/${row.customerId}`} className="truncate text-[15px] font-semibold hover:underline">
            {row.customerName}
          </Link>
          <span className="text-xs text-muted-foreground">
            Bill {formatDay(row.saleDate)} · {formatRupees(row.total)}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {settled ? (
            <span className="inline-flex h-6 items-center rounded-full bg-fresh-soft px-2.5 text-xs font-semibold text-fresh">
              Paid in full
            </span>
          ) : (
            <>
              <ExtendedTag count={row.extensions} />
              <DueBadge daysLeft={row.daysLeft} />
            </>
          )}
        </div>
      </header>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Paid"
        aria-valuemin={0}
        aria-valuemax={row.total}
        aria-valuenow={row.paid}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular">
          Paid {formatRupees(row.paid)} of {formatRupees(row.total)}
        </span>
        <span className="text-xl font-bold tabular" data-testid="credit-balance">
          {formatRupees(row.balance)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{settled ? "" : payByLine(row.payBy, row.originalPayBy)}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            Payments
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
          {settled || !canWrite ? null : (
            <>
              <Button type="button" variant="outline" size="sm" className="h-9 bg-card" onClick={onExtend}>
                Change date
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9 bg-card" onClick={onRecord}>
                Record payment
              </Button>
            </>
          )}
        </div>
      </div>

      {open ? <PaymentsList row={row} isAdmin={isAdmin} onEdit={onEdit} /> : null}
    </article>
  );
}
