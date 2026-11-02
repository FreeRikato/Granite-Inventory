"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { PaymentAmounts, PaymentModeChips } from "@/components/payment-split";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { checkReceipt, formatDay, type CreditRow } from "@/lib/credit";
import { formatRupees, todayIso } from "@/lib/format";
import { singleMode, splitFromPayments, type PaymentSplit } from "@/lib/payment-split";
import { useAfterWrite } from "@/lib/query/provider";
import type { CreditReceipt } from "@/lib/query/reads";
import { useRefusal } from "@/lib/use-refusal";
import { correctCreditPaymentAction, recordCreditPaymentAction } from "./actions";

type Props = {
  readonly row: CreditRow;
  readonly receipt: CreditReceipt | null;
  readonly onClose: () => void;
};

export function ReceiptDialog({ row, receipt, onClose }: Props) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const received = receipt?.lines.reduce((sum, l) => sum + l.amount, 0) ?? 0;
  const available = row.balance + received;
  const [split, setSplit] = useState<PaymentSplit>(receipt ? splitFromPayments(receipt.lines) : singleMode("CASH"));
  const [amount, setAmount] = useState(String(receipt ? received : row.balance));
  const [paidOn, setPaidOn] = useState(receipt?.paidOn ?? todayIso());
  const { error, refuse } = useRefusal([split, amount, paidOn]);
  const total = Number(amount) || 0;
  const editing = receipt !== null;

  function save() {
    const checked = checkReceipt(split, amount, available);
    if (checked.kind === "refused") {
      refuse(checked.message);
      return;
    }
    startTransition(async () => {
      const payments = checked.payments;
      const result = receipt
        ? await correctCreditPaymentAction({ paymentId: receipt.id, paidOn, payments })
        : await recordCreditPaymentAction({ billId: row.billId, paidOn, payments });
      if (!result.ok) {
        refuse(result.error);
        return;
      }
      toast.success(editing ? "Payment updated" : `Payment of ${formatRupees(total)} recorded`);
      afterWrite(editing ? "correct-credit-payment" : "record-credit-payment");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            {row.customerName} ·{" "}
            {editing
              ? `payment of ${formatDay(receipt.paidOn)} · Admin only`
              : `Bill of ${formatDay(row.saleDate)} · ${formatRupees(row.total)}`}
          </DialogDescription>
        </DialogHeader>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid so far</dt>
            <dd className="font-semibold tabular">{formatRupees(row.paid - received)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-semibold">Balance</dt>
            <dd className="font-bold tabular" data-testid="receipt-balance">
              {formatRupees(available)}
            </dd>
          </div>
        </dl>

        <Field label="Payment Mode" hint="Tap more than one to split the payment">
          <PaymentModeChips split={split} onChange={setSplit} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={split.modes.length > 1 ? "This payment (₹)" : "Amount (₹)"} htmlFor="receipt-amount">
            <Input
              id="receipt-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 text-right tabular"
            />
          </Field>
          <Field label="Date paid" htmlFor="receipt-date">
            <Input
              id="receipt-date"
              type="date"
              min={row.saleDate}
              max={todayIso()}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="h-11"
            />
          </Field>
        </div>

        <PaymentAmounts split={split} total={total} onChange={setSplit} idPrefix="receipt" />

        <p className="text-xs text-muted-foreground">Cannot be more than the balance or dated after today.</p>
        {error ? (
          <p className="text-xs text-stale" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {editing ? "Save changes" : "Record payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
