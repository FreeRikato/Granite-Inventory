"use client";

import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatDayAt, type CreditRow } from "@/lib/credit";
import { formatRupees, todayIso } from "@/lib/format";
import { useAfterWrite } from "@/lib/query/provider";
import { creditPaymentsQuery } from "@/lib/query/reads";
import { useRefusal } from "@/lib/use-refusal";
import { extendPayByAction } from "./actions";

export function ExtendDialog({ row, onClose }: { readonly row: CreditRow; readonly onClose: () => void }) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const history = useQuery(creditPaymentsQuery(row.billId));
  const [payBy, setPayBy] = useState("");
  const { error, refuse } = useRefusal([payBy]);
  const promises = history.data?.promises ?? [];

  function save() {
    if (payBy === "") {
      refuse("Pick the new pay-by date");
      return;
    }
    startTransition(async () => {
      const result = await extendPayByAction({ billId: row.billId, payBy });
      if (!result.ok) {
        refuse(result.error);
        return;
      }
      toast.success(`Pay-by date moved to ${formatDay(payBy)}`);
      afterWrite("extend-pay-by");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change pay-by date</DialogTitle>
          <DialogDescription>
            {row.customerName} · Bill of {formatDay(row.saleDate)} · balance {formatRupees(row.balance)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">History</span>
          {history.isSuccess ? (
            <ul className="flex flex-col gap-1.5 border-l-2 border-border pl-3" data-testid="promise-history">
              {promises.map((p, i) => (
                <li key={`${p.payBy}-${p.madeAt}`} className="text-sm">
                  <span className="font-semibold">{formatDay(p.payBy)}</span>
                  <span className="text-muted-foreground">
                    {i === 0 ? " · original, set at the sale" : ` · extended on ${formatDayAt(p.madeAt)}`}
                    {p.madeBy && i > 0 ? ` by ${p.madeBy}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton className="h-10 rounded-tile" />
          )}
        </div>

        <Field
          label="New pay-by date"
          htmlFor="extend-date"
          hint={
            payBy
              ? `${formatDay(payBy)}. Days late will count from this date. The earlier dates stay in the history.`
              : "Days late count from the new date. The earlier dates stay in the history."
          }
        >
          <Input
            id="extend-date"
            type="date"
            min={todayIso()}
            value={payBy}
            onChange={(e) => setPayBy(e.target.value)}
            className="h-11"
            autoFocus
          />
        </Field>

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
            Save date
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
