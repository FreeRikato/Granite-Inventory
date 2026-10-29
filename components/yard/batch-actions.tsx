"use client";

import { useRef, useState, useTransition } from "react";
import { useAfterSettled, useAfterWrite } from "@/lib/query/provider";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isCategory, slotChoices, slotLabel } from "@/lib/domain";
import { todayIso } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { archiveBatchAction, correctBatchAction, deleteBatchAction } from "@/app/(app)/yard/actions";

export type EditLists = {
  readonly products: readonly { id: string; name: string; category: string; archived_at: string | null }[];
  readonly suppliers: readonly { id: string; name: string; archived_at: string | null }[];
  readonly slots: readonly string[];
};

type EditableBatch = Omit<Tables<"v_batches">, "total_cost">;

type Props = { readonly batch: EditableBatch; readonly lists: EditLists; readonly iconOnly?: boolean };

export function BatchActions({ batch, lists, iconOnly }: Props) {
  const afterWrite = useAfterWrite();
  const afterSettled = useAfterSettled();
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

  function toggleArchive() {
    const archiving = !batch.archived_at;
    startTransition(async () => {
      const result = await archiveBatchAction(batch.id ?? "", archiving);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Batch ${batch.batch_code} ${archiving ? "archived" : "unarchived"}`);
      afterWrite();
    });
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon" : "sm"}
        className={iconOnly ? "size-8" : "h-9 bg-card"}
        onClick={() => setOpen(true)}
        aria-label={`Edit ${batch.batch_code}`}
      >
        <Pencil className="size-4" />
        {iconOnly ? null : " Edit"}
      </Button>
      <Button
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon" : "sm"}
        className={iconOnly ? "size-8" : "h-9 bg-card"}
        onClick={toggleArchive}
        disabled={pending}
        aria-label={`${batch.archived_at ? "Unarchive" : "Archive"} ${batch.batch_code}`}
      >
        {batch.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        {iconOnly ? null : batch.archived_at ? " Unarchive" : " Archive"}
      </Button>
      {batch.archived_at && (batch.units_sold ?? 0) === 0 ? (
        <ConfirmDelete
          title={`Delete batch ${batch.batch_code}?`}
          description="This batch is archived and has no sales. It will be removed for good."
          onConfirm={remove}
          disabled={pending}
          iconLabel={iconOnly ? `Delete ${batch.batch_code}` : undefined}
        />
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRef.current;
            const batchCode = batch.batch_code;
            afterSettled(() => {
              if (trigger?.isConnected) {
                trigger.focus();
                return;
              }

              if (batchCode) {
                const replacement = Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-label]")).find(
                  (button) => button.getAttribute("aria-label") === `Edit ${batchCode}`,
                );
                if (replacement?.isConnected) {
                  replacement.focus();
                  return;
                }
              }

              const filterToolbar = document.querySelector<HTMLElement>("[data-yard-filter-toolbar]");
              if (filterToolbar?.isConnected) filterToolbar.focus();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit batch {batch.batch_code}</DialogTitle>
          </DialogHeader>
          {open ? (
            <BatchEditForm
              batch={batch}
              lists={lists}
              onDone={() => {
                setOpen(false);
                afterWrite();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BatchEditForm({ batch, lists, onDone }: { batch: EditableBatch; lists: EditLists; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: batch.product_id ?? "",
    supplierId: batch.supplier_id ?? "",
    purchaseDate: batch.purchase_date ?? todayIso(),
    lengthFt: batch.length_ft?.toString() ?? "",
    breadthFt: batch.breadth_ft?.toString() ?? "",
    thicknessMm: batch.thickness_mm?.toString() ?? "",
    slot: batch.slot ?? "CUSTOM",
    stackNumber: batch.stack_number ?? "",
    initialUnits: batch.initial_units?.toString() ?? "",
    unitPurchasePrice: batch.unit_purchase_price?.toString() ?? "",
    notes: batch.notes ?? "",
  });
  const productOptions = lists.products.filter((p) => !p.archived_at || p.id === batch.product_id);
  const supplierOptions = lists.suppliers.filter((s) => !s.archived_at || s.id === batch.supplier_id);
  const slots = slotChoices([...lists.slots, batch.slot, form.slot]);
  const product = lists.products.find((p) => p.id === form.productId);
  const memorial = product ? isCategory(product.category) && product.category === "MEMORIAL" : false;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await correctBatchAction({
        ...form,
        batchId: batch.id,
        memorial,
        variantName: form.productId === batch.product_id ? (batch.variant_name ?? undefined) : undefined,
      });
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
          <Input
            id="eb-date"
            type="date"
            max={todayIso()}
            value={form.purchaseDate}
            onChange={(e) => set("purchaseDate", e.target.value)}
          />
        </Field>
        <Field label="Supplier" htmlFor="eb-supplier">
          <SearchSelect
            id="eb-supplier"
            options={supplierOptions.map((s) => ({ value: s.id, label: s.name }))}
            value={form.supplierId}
            onChange={(v) => set("supplierId", v)}
            placeholder="Supplier"
            className="h-9"
          />
        </Field>
        <Field label="Product" htmlFor="eb-product">
          <SearchSelect
            id="eb-product"
            options={productOptions.map((p) => ({ value: p.id, label: p.name }))}
            value={form.productId}
            onChange={(v) => set("productId", v)}
            placeholder="Product"
            className="h-9"
          />
        </Field>
      </div>
      {!memorial ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Length (ft)" htmlFor="eb-length">
            <Input
              id="eb-length"
              type="number"
              step="0.25"
              min="0"
              value={form.lengthFt}
              onChange={(e) => set("lengthFt", e.target.value)}
            />
          </Field>
          <Field label="Breadth (ft)" htmlFor="eb-breadth">
            <Input
              id="eb-breadth"
              type="number"
              step="0.25"
              min="0"
              value={form.breadthFt}
              onChange={(e) => set("breadthFt", e.target.value)}
            />
          </Field>
          <Field label="Thickness (mm)" htmlFor="eb-thickness">
            <Input
              id="eb-thickness"
              type="number"
              step="1"
              min="0"
              value={form.thicknessMm}
              onChange={(e) => set("thicknessMm", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unit Quantity" htmlFor="eb-units" hint={`${batch.units_sold ?? 0} already sold`}>
          <Input
            id="eb-units"
            type="number"
            step="1"
            min={batch.units_sold ?? 1}
            value={form.initialUnits}
            onChange={(e) => set("initialUnits", e.target.value)}
          />
        </Field>
        <Field label="Unit Purchase Price (₹)" htmlFor="eb-price" hint="Per piece, freight included">
          <Input
            id="eb-price"
            type="number"
            step="1"
            min="0"
            value={form.unitPurchasePrice}
            onChange={(e) => set("unitPurchasePrice", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Yard slot" htmlFor="eb-slot">
          <SearchSelect
            id="eb-slot"
            options={slots.map((s) => ({ value: s, label: slotLabel(s) }))}
            value={form.slot}
            onChange={(v) => set("slot", v)}
            placeholder="Yard slot"
            searchPlaceholder="Search or type a slot..."
            onCreate={(name) => set("slot", name)}
            createLabel={(q) => `Add slot "${q}"`}
            className="h-9"
          />
        </Field>
        <Field label="Batch number" htmlFor="eb-stack">
          <Input
            id="eb-stack"
            maxLength={20}
            value={form.stackNumber}
            onChange={(e) => set("stackNumber", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor="eb-notes">
        <Textarea id="eb-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <Notice tone="accent" className="text-xs">
        Sales already recorded keep the landed cost they were sold at. The batch code stays as written on the stack.
      </Notice>
      {error ? (
        <Notice tone="error" icon="alert">
          {error}
        </Notice>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
