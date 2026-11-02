"use client";

import { useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeReceipt, formatDay, isOpen, type CreditRow } from "@/lib/credit";
import { formatRupees } from "@/lib/format";
import { useAfterWrite } from "@/lib/query/provider";
import { creditPaymentsQuery, type CreditReceipt, type ReceiptLine } from "@/lib/query/reads";
import { deleteCreditPaymentAction } from "./actions";

type Props = {
  readonly row: CreditRow;
  readonly isAdmin: boolean;
  readonly onEdit: (receipt: CreditReceipt) => void;
};

const sum = (lines: readonly ReceiptLine[]) => lines.reduce((total, l) => total + l.amount, 0);

export function PaymentsList({ row, isAdmin, onEdit }: Props) {
  const payments = useQuery(creditPaymentsQuery(row.billId));
  if (payments.isError) {
    return <p className="text-xs text-destructive">Could not load the payments: {payments.error.message}</p>;
  }
  if (!payments.isSuccess) return <Skeleton className="h-16 rounded-tile" />;
  const { atSale, later } = payments.data;

  return (
    <ul className="flex flex-col divide-y divide-border border-t border-border" data-testid="payments-list">
      <li className="flex items-center justify-between gap-3 py-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">{formatDay(row.saleDate)} · at the sale</span>
          <span className="text-xs text-muted-foreground">
            {atSale.lines.length === 0
              ? "Nothing paid at the sale"
              : `${describeReceipt(atSale.lines)}${atSale.recordedBy ? ` · recorded by ${atSale.recordedBy}` : ""}`}
          </span>
        </span>
        <span className="text-sm font-bold tabular">{formatRupees(sum(atSale.lines))}</span>
      </li>
      {later.map((receipt) => (
        <ReceiptRow key={receipt.id} row={row} receipt={receipt} isAdmin={isAdmin} onEdit={onEdit} />
      ))}
    </ul>
  );
}

function ReceiptRow({
  row,
  receipt,
  isAdmin,
  onEdit,
}: {
  readonly row: CreditRow;
  readonly receipt: CreditReceipt;
  readonly isAdmin: boolean;
  readonly onEdit: (receipt: CreditReceipt) => void;
}) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const amount = sum(receipt.lines);

  function remove() {
    startTransition(async () => {
      const result = await deleteCreditPaymentAction(receipt.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment deleted");
      afterWrite("delete-credit-payment");
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3" data-testid="credit-receipt">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{formatDay(receipt.paidOn)}</span>
        <span className="text-xs text-muted-foreground">
          {describeReceipt(receipt.lines)}
          {receipt.recordedBy ? ` · recorded by ${receipt.recordedBy}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="mr-1 text-sm font-bold tabular">{formatRupees(amount)}</span>
        {isAdmin ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Edit payment of ${formatDay(receipt.paidOn)}`}
              onClick={() => onEdit(receipt)}
            >
              <Pencil className="size-4" />
            </Button>
            <ConfirmDelete
              title="Delete this payment?"
              description={`${row.customerName} · ${formatDay(receipt.paidOn)} · ${describeReceipt(receipt.lines)}`}
              label="Delete payment"
              iconLabel={`Delete payment of ${formatDay(receipt.paidOn)}`}
              pending={pending}
              disabled={pending}
              onConfirm={remove}
            >
              <p className="rounded-tile bg-stale-soft px-4 py-3 text-sm text-stale">
                {consequence(row, receipt, amount)}
              </p>
            </ConfirmDelete>
          </>
        ) : null}
      </span>
    </li>
  );
}

function consequence(row: CreditRow, receipt: CreditReceipt, amount: number): string {
  const after = row.balance + amount;
  const reopens = isOpen(row)
    ? ""
    : ` and the Bill returns to the open Credit list${row.daysLeft < 0 ? `, overdue since ${formatDay(row.payBy)}` : ""}`;
  return `The balance goes back from ${formatRupees(row.balance)} to ${formatRupees(after)}${reopens}. The Money received card loses ${formatRupees(amount)} on ${formatDay(receipt.paidOn)}.`;
}
