"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { formatDate, formatSize, todayIso } from "@/lib/format";
import { correctSaleAction, deleteSaleAction } from "@/app/(app)/sell/actions";

type Sale = Tables<"v_sales">;
type BatchOption = Pick<Tables<"v_yard_batches">, "id" | "batch_code" | "line_key" | "available" | "purchase_date" | "product_name" | "variant_name" | "length_ft" | "breadth_ft" | "thickness_mm">;
type CustomerOption = { id: string; name: string; phone: string | null };

export type SaleEditLists = {
  readonly batches: readonly BatchOption[];
  readonly customers: readonly CustomerOption[];
};

export function SaleActions({ sale, lists }: { readonly sale: Sale; readonly lists: SaleEditLists }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function remove() {
    startTransition(async () => {
      const result = await deleteSaleAction(sale.id ?? "");
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Sale deleted, pieces returned to the batch");
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setOpen(true)} aria-label={`Edit sale of ${sale.batch_code}`}>
        <Pencil className="size-3.5" /> Edit
      </Button>
      <ConfirmDelete
        title="Delete this sale?"
        description={`${sale.quantity} piece(s) go back to batch ${sale.batch_code}.`}
        onConfirm={remove}
        disabled={pending}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Edit sale</DialogTitle></DialogHeader>
          {open ? <SaleEditForm sale={sale} lists={lists} onDone={() => { setOpen(false); router.refresh(); }} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaleEditForm({ sale, lists, onDone }: { sale: Sale; lists: SaleEditLists; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    batchId: sale.batch_id ?? "",
    customerId: sale.customer_id ?? "",
    saleDate: sale.sale_date ?? todayIso(),
    quantity: sale.quantity?.toString() ?? "1",
    salePrice: sale.sale_price?.toString() ?? "",
    paymentMode: isPaymentMode(sale.payment_mode) ? sale.payment_mode : "CASH",
    hasStickering: sale.has_stickering ?? false,
    stickeringCost: sale.stickering_cost?.toString() ?? "0",
    stickeringPrice: sale.stickering_price?.toString() ?? "0",
    miscExpense: sale.misc_expense?.toString() ?? "0",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  /* Batches offered: the current one plus any with stock, so a sale can move to the right pile. */
  const current = lists.batches.find((b) => b.id === sale.batch_id);
  const options = lists.batches
    .filter((b) => b.id === sale.batch_id || (b.available ?? 0) > 0)
    .sort((a, b) => (a.line_key === current?.line_key ? -1 : 1) - (b.line_key === current?.line_key ? -1 : 1));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await correctSaleAction({ ...form, saleId: sale.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Sale updated");
      onDone();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sale Date" htmlFor="es-date">
          <Input id="es-date" type="date" max={todayIso()} value={form.saleDate} onChange={(e) => set("saleDate", e.target.value)} />
        </Field>
        <Field label="Payment Mode" htmlFor="es-payment">
          <Select value={form.paymentMode} onValueChange={(v) => { if (isPaymentMode(v)) set("paymentMode", v); }}>
            <SelectTrigger id="es-payment" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Customer" htmlFor="es-customer">
          <SearchSelect id="es-customer" className="h-9" options={lists.customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone ?? undefined }))} value={form.customerId} onChange={(v) => set("customerId", v)} placeholder="Customer" />
        </Field>
        <Field label="Batch" htmlFor="es-batch">
          <SearchSelect
            id="es-batch"
            className="h-9"
            options={options.map((b) => ({
              value: b.id ?? "",
              label: `${b.batch_code} · ${b.product_name} ${b.variant_name}`,
              hint: `${formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })} · bought ${b.purchase_date ? formatDate(b.purchase_date) : ""} · ${b.available} available`,
            }))}
            value={form.batchId}
            onChange={(v) => set("batchId", v)}
            placeholder="Batch"
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quantity" htmlFor="es-qty"><Input id="es-qty" type="number" min="1" step="1" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
        <Field label="Stone Sale Price (₹)" htmlFor="es-price" hint="Per piece"><Input id="es-price" type="number" min="0" step="1" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} /></Field>
        <Field label="Misc Expense (₹)" htmlFor="es-misc"><Input id="es-misc" type="number" min="0" step="1" value={form.miscExpense} onChange={(e) => set("miscExpense", e.target.value)} /></Field>
      </div>
      <div className="flex items-center justify-between rounded-tile border border-border p-3">
        <span className="text-sm font-semibold">Stickering / Engraving</span>
        <Switch checked={form.hasStickering} onCheckedChange={(c) => set("hasStickering", c)} aria-label="Stickering" />
      </div>
      {form.hasStickering ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stickering Cost (₹)" htmlFor="es-scost"><Input id="es-scost" type="number" min="0" step="1" value={form.stickeringCost} onChange={(e) => set("stickeringCost", e.target.value)} /></Field>
          <Field label="Stickering Price (₹)" htmlFor="es-sprice"><Input id="es-sprice" type="number" min="0" step="1" value={form.stickeringPrice} onChange={(e) => set("stickeringPrice", e.target.value)} /></Field>
        </div>
      ) : null}
      <Notice tone="accent" className="text-xs">
        Moving the sale to another batch re-snapshots the landed cost from that batch; otherwise the original cost stays.
      </Notice>
      {error ? <Notice tone="error" icon="alert">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
      </div>
    </form>
  );
}
