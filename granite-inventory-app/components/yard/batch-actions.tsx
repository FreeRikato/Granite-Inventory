"use client";

import { useRef, useState, useTransition } from "react";
import { useAfterWrite } from "@/lib/query/provider";
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
import { Textarea } from "@/components/ui/textarea";
import { SLOTS, SLOT_LABEL, isCategory, isSlot } from "@/lib/domain";
import { todayIso } from "@/lib/format";
import type { YardBatch } from "@/lib/yard";
import { correctBatchAction, deleteBatchAction } from "@/app/(app)/yard/actions";

export type EditLists = {
  readonly products: readonly { id: string; name: string; category: string }[];
  readonly suppliers: readonly { id: string; name: string }[];
};

type Props = { readonly batch: YardBatch; readonly lists: EditLists };

/* Admin-only edit and delete on a yard card. Delete is refused by the database while
   sales exist, so the button is simply hidden in that case. */
export function BatchActions({ batch, lists }: Props) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function remove() {
    startTransition(async () => {
      const result = await deleteBatchAction(batch.id ?? "");
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Batch ${batch.batch_code} deleted`);
      afterWrite();
    });
  }

  return (
    <>
      <Button ref={triggerRef} variant="outline" size="sm" className="h-9 bg-card" onClick={() => setOpen(true)} aria-label={`Edit ${batch.batch_code}`}>
        <Pencil className="size-4" /> Edit
      </Button>
      {(batch.units_sold ?? 0) === 0 ? (
        <ConfirmDelete
          title={`Delete batch ${batch.batch_code}?`}
          description="This batch has no sales. It will be removed from the yard for good."
          onConfirm={remove}
          disabled={pending}
        />
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit batch {batch.batch_code}</DialogTitle>
          </DialogHeader>
          {open ? <BatchEditForm batch={batch} lists={lists} onDone={() => { setOpen(false); afterWrite(); }} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BatchEditForm({ batch, lists, onDone }: { batch: YardBatch; lists: EditLists; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: batch.product_id ?? "",
    variantName: batch.variant_name ?? "",
    supplierId: batch.supplier_id ?? "",
    purchaseDate: batch.purchase_date ?? todayIso(),
    lengthFt: batch.length_ft?.toString() ?? "",
    breadthFt: batch.breadth_ft?.toString() ?? "",
    thicknessMm: batch.thickness_mm?.toString() ?? "",
    slot: isSlot(batch.slot) ? batch.slot : "CUSTOM",
    initialUnits: batch.initial_units?.toString() ?? "",
    unitPurchasePrice: batch.unit_purchase_price?.toString() ?? "",
    freightCost: batch.freight_cost?.toString() ?? "0",
    notes: batch.notes ?? "",
  });
  const product = lists.products.find((p) => p.id === form.productId);
  const memorial = product ? isCategory(product.category) && product.category === "MEMORIAL" : false;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await correctBatchAction({ ...form, batchId: batch.id, memorial });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Batch ${batch.batch_code} updated`);
      onDone();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Purchase Date" htmlFor="eb-date">
          <Input id="eb-date" type="date" max={todayIso()} value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
        </Field>
        <Field label="Supplier" htmlFor="eb-supplier">
          <SearchSelect id="eb-supplier" options={lists.suppliers.map((s) => ({ value: s.id, label: s.name }))} value={form.supplierId} onChange={(v) => set("supplierId", v)} placeholder="Supplier" className="h-9" />
        </Field>
        <Field label="Product" htmlFor="eb-product">
          <SearchSelect id="eb-product" options={lists.products.map((p) => ({ value: p.id, label: p.name }))} value={form.productId} onChange={(v) => set("productId", v)} placeholder="Product" className="h-9" />
        </Field>
        <Field label="Variant Name" htmlFor="eb-variant">
          <Input id="eb-variant" value={form.variantName} onChange={(e) => set("variantName", e.target.value)} />
        </Field>
      </div>
      {!memorial ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Length (ft)" htmlFor="eb-length"><Input id="eb-length" type="number" step="0.25" min="0" value={form.lengthFt} onChange={(e) => set("lengthFt", e.target.value)} /></Field>
          <Field label="Breadth (ft)" htmlFor="eb-breadth"><Input id="eb-breadth" type="number" step="0.25" min="0" value={form.breadthFt} onChange={(e) => set("breadthFt", e.target.value)} /></Field>
          <Field label="Thickness (mm)" htmlFor="eb-thickness"><Input id="eb-thickness" type="number" step="1" min="0" value={form.thicknessMm} onChange={(e) => set("thicknessMm", e.target.value)} /></Field>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Unit Quantity" htmlFor="eb-units" hint={`${batch.units_sold ?? 0} already sold`}>
          <Input id="eb-units" type="number" step="1" min={batch.units_sold ?? 1} value={form.initialUnits} onChange={(e) => set("initialUnits", e.target.value)} />
        </Field>
        <Field label="Unit Purchase Price (₹)" htmlFor="eb-price"><Input id="eb-price" type="number" step="1" min="0" value={form.unitPurchasePrice} onChange={(e) => set("unitPurchasePrice", e.target.value)} /></Field>
        <Field label="Freight Cost (₹)" htmlFor="eb-freight"><Input id="eb-freight" type="number" step="1" min="0" value={form.freightCost} onChange={(e) => set("freightCost", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Yard slot" htmlFor="eb-slot">
          <Select value={form.slot} onValueChange={(v) => { if (isSlot(v)) set("slot", v); }}>
            <SelectTrigger id="eb-slot" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{SLOTS.map((s) => <SelectItem key={s} value={s}>{SLOT_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="eb-notes">
          <Textarea id="eb-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      <Notice tone="accent" className="text-xs">
        Sales already recorded keep the landed cost they were sold at. The batch code stays as written on the stack.
      </Notice>
      {error ? <Notice tone="error" icon="alert">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
      </div>
    </form>
  );
}
