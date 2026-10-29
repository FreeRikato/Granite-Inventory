"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { prefillSplit, splitCovers } from "./cart";

export type SplitRow = {
  readonly batchId: string;
  readonly batchCode: string;
  readonly available: number;
};

type Props = {
  readonly quantity: number | null;
  readonly rows: readonly SplitRow[];
  readonly onConfirm: (takes: readonly number[]) => void;
  readonly onClose: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
};

export function SplitDialog({ quantity, rows, onConfirm, onClose, onCloseAutoFocus }: Props) {
  return (
    <Dialog
      open={quantity !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>
            Split {quantity} {quantity === 1 ? "piece" : "pieces"} across batches
          </DialogTitle>
          <DialogDescription>Oldest first. Counts must add up to the quantity asked.</DialogDescription>
        </DialogHeader>
        {quantity !== null ? (
          <SplitCounts quantity={quantity} rows={rows} onConfirm={onConfirm} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SplitCounts({
  quantity,
  rows,
  onConfirm,
  onClose,
}: Pick<Props, "rows" | "onConfirm" | "onClose"> & { readonly quantity: number }) {
  const availables = rows.map((row) => row.available);
  const [counts, setCounts] = useState<readonly string[]>(() => prefillSplit(availables, quantity).map(String));
  const takes = counts.map(Number);
  const total = takes.reduce((sum, take) => sum + take, 0);
  const covers = splitCovers(availables, takes, quantity);

  return (
    <>
      <ul className="flex max-h-64 min-w-0 flex-col gap-2 overflow-y-auto">
        {rows.map((row, index) => (
          <li
            key={row.batchId}
            data-testid="split-row"
            className="flex min-w-0 items-center gap-3 rounded-tile border border-border bg-card px-3 py-2"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{row.batchCode}</span>
              <span className="text-xs text-muted-foreground">{row.available} available</span>
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              aria-label={`Take from ${row.batchCode}`}
              value={counts[index] ?? ""}
              onChange={(e) => setCounts(counts.map((count, i) => (i === index ? e.target.value : count)))}
              className="h-10 w-20 shrink-0"
            />
          </li>
        ))}
      </ul>
      <p data-testid="split-total" className={cn("text-sm font-semibold tabular", !covers && "text-stale")}>
        {total} of {quantity}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!covers} onClick={() => onConfirm(takes)}>
          Add
        </Button>
      </DialogFooter>
    </>
  );
}
