"use client";

import { useRef, useState, useTransition } from "react";
import { useAfterSettled, useAfterWrite } from "@/lib/query/provider";
import { RowMark, useRowRemoval } from "@/lib/query/row-state";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL, isPaymentMode } from "@/lib/domain";
import type { Tables } from "@/lib/database.types";
import { formatDate, formatSaleLine, formatSize, todayIso } from "@/lib/format";
import { pieceArea, salePricePerPiece } from "@/lib/sale-price";
import { saleSchema } from "@/lib/schemas/sale";
import { useRefusal } from "@/lib/use-refusal";
import { correctSaleAction, deleteSaleAction } from "@/app/(app)/sell/actions";

type Sale = Tables<"v_sales">;
type BatchOption = Pick<
  Tables<"v_yard_batches">,
  | "id"
  | "batch_code"
  | "line_key"
  | "available"
  | "purchase_date"
  | "product_name"
  | "length_ft"
  | "breadth_ft"
  | "thickness_mm"
  | "archived_at"
>;
type CustomerOption = { id: string; name: string; phone: string | null };

export type SaleEditLists = {
  readonly batches: readonly BatchOption[];
  readonly customers: readonly CustomerOption[];
};

export function SaleActions({ sale, lists }: { readonly sale: Sale; readonly lists: SaleEditLists }) {
  const afterWrite = useAfterWrite();
  const afterSettled = useAfterSettled();
  const removal = useRowRemoval("delete-sale");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function remove() {
    removal.remove(
      () => deleteSaleAction(sale.id ?? ""),
      "Sale deleted, pieces returned to the batch",
      () => afterWrite("delete-sale"),
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <RowMark state={removal.state} />
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        className="h-8 bg-card"
        onClick={() => setOpen(true)}
        aria-label={`Edit sale of ${sale.batch_code}`}
      >
        <Pencil className="size-3.5" /> Edit
      </Button>
      <ConfirmDelete
        title="Delete this sale?"
        description={`${sale.quantity} piece(s) go back to batch ${sale.batch_code}.`}
        onConfirm={remove}
        disabled={removal.pending}
        pending={removal.pending}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRef.current;
            afterSettled(() => {
              if (trigger?.isConnected) trigger.focus();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit sale</DialogTitle>
          </DialogHeader>
          {open ? (
            <SaleEditForm
              sale={sale}
              lists={lists}
              onDone={() => {
                setOpen(false);
                afterWrite("correct-sale");
              }}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaleEditForm({
  sale,
  lists,
  onDone,
  onCancel,
}: {
  sale: Sale;
  lists: SaleEditLists;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    batchId: sale.batch_id ?? "",
    customerId: sale.customer_id ?? "",
    saleDate: sale.sale_date ?? todayIso(),
    quantity: sale.quantity?.toString() ?? "1",
    saleRate: sale.sale_rate?.toString() ?? "",
    paymentMode: isPaymentMode(sale.payment_mode) ? sale.payment_mode : "CASH",
    hasStickering: sale.has_stickering ?? false,
    stickeringCost: sale.stickering_cost?.toString() ?? "0",
    stickeringPrice: sale.stickering_price?.toString() ?? "0",
  });
  const { error, refuse, clear } = useRefusal(form);
  const billed = sale.bill_id !== null;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const current = lists.batches.find((b) => b.id === sale.batch_id);
  const chosen = lists.batches.find((b) => b.id === form.batchId);
  const areaSqft =
    form.batchId === sale.batch_id
      ? sale.area_sqft
      : chosen === undefined
        ? undefined
        : pieceArea(chosen.length_ft, chosen.breadth_ft);
  const memorial = areaSqft === null;
  const entered = saleSchema.pick({ quantity: true, saleRate: true, stickeringPrice: true }).safeParse(form);
  const working =
    areaSqft !== undefined && entered.success
      ? formatSaleLine({
          quantity: entered.data.quantity,
          saleRate: entered.data.saleRate,
          areaSqft,
          stoneTotal: entered.data.quantity * salePricePerPiece(areaSqft, entered.data.saleRate),
          stickeringPrice: form.hasStickering ? entered.data.stickeringPrice : null,
        })
      : null;
  const options = lists.batches
    .filter((b) => b.id === sale.batch_id || ((b.available ?? 0) > 0 && !b.archived_at))
    .sort((a, b) => (a.line_key === current?.line_key ? -1 : 1) - (b.line_key === current?.line_key ? -1 : 1));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    clear();
    startTransition(async () => {
      const result = await correctSaleAction({ ...form, saleId: sale.id });
      if (!result.ok) {
        refuse(result.error);
        return;
      }
      toast.success("Sale updated");
      onDone();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {billed ? (
          <>
            <BilledValue id="es-date" label="Sale Date" value={sale.sale_date ? formatDate(sale.sale_date) : ""} />
            <BilledValue id="es-payment" label="Payment Mode" value={PAYMENT_MODE_LABEL[form.paymentMode]} />
            <BilledValue id="es-customer" label="Customer" value={sale.customer_name ?? ""} />
          </>
        ) : (
          <>
            <Field label="Sale Date" htmlFor="es-date">
              <Input
                id="es-date"
                type="date"
                max={todayIso()}
                value={form.saleDate}
                onChange={(e) => set("saleDate", e.target.value)}
              />
            </Field>
            <Field label="Payment Mode" htmlFor="es-payment">
              <Select
                value={form.paymentMode}
                onValueChange={(v) => {
                  if (isPaymentMode(v)) set("paymentMode", v);
                }}
              >
                <SelectTrigger id="es-payment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_MODE_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Customer" htmlFor="es-customer">
              <SearchSelect
                id="es-customer"
                className="h-9"
                options={lists.customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone ?? undefined }))}
                value={form.customerId}
                onChange={(v) => set("customerId", v)}
                placeholder="Customer"
              />
            </Field>
          </>
        )}
        <Field label="Batch" htmlFor="es-batch">
          <SearchSelect
            id="es-batch"
            className="h-9"
            options={options.map((b) => ({
              value: b.id ?? "",
              label: `${b.batch_code} · ${b.product_name}`,
              hint: `${formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })} · bought ${b.purchase_date ? formatDate(b.purchase_date) : ""} · ${b.available} available`,
            }))}
            value={form.batchId}
            onChange={(v) => set("batchId", v)}
            placeholder="Batch"
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity" htmlFor="es-qty">
          <Input
            id="es-qty"
            type="number"
            min="1"
            step="1"
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>
        <Field label="Stone Sale Price (₹)" htmlFor="es-price" hint={memorial ? "Per piece" : "Per sq ft"}>
          <Input
            id="es-price"
            type="number"
            min="0"
            step="1"
            value={form.saleRate}
            onChange={(e) => set("saleRate", e.target.value)}
          />
        </Field>
      </div>
      {working ? (
        <p className="text-sm tabular text-muted-foreground" data-testid="sale-working">
          {working}
        </p>
      ) : null}
      <div className="flex items-center justify-between rounded-tile border border-border p-3">
        <span className="text-sm font-semibold">Stickering / Engraving</span>
        <Switch checked={form.hasStickering} onCheckedChange={(c) => set("hasStickering", c)} aria-label="Stickering" />
      </div>
      {form.hasStickering ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stickering Cost (₹)" htmlFor="es-scost">
            <Input
              id="es-scost"
              type="number"
              min="0"
              step="1"
              value={form.stickeringCost}
              onChange={(e) => set("stickeringCost", e.target.value)}
            />
          </Field>
          <Field label="Stickering Price (₹)" htmlFor="es-sprice">
            <Input
              id="es-sprice"
              type="number"
              min="0"
              step="1"
              value={form.stickeringPrice}
              onChange={(e) => set("stickeringPrice", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      <Notice tone="accent" className="text-xs">
        Moving the sale to another batch re-snapshots the landed cost from that batch; otherwise the original cost
        stays.
      </Notice>
      {error ? (
        <Notice tone="error" icon="alert">
          {error}
        </Notice>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function BilledValue({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <Field label={label} htmlFor={id} hint="Set by the bill">
      <Input id={id} readOnly value={value} className="bg-muted" />
    </Field>
  );
}
