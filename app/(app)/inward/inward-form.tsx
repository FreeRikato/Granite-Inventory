"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useAfterWrite } from "@/lib/query/provider";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddButton } from "@/components/add-button";
import { Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { SearchSelect, type OptionAction, type SearchOption } from "@/components/search-select";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  isCategory,
  slotChoices,
  slotLabel,
  stackLabel,
  suggestAbbreviation,
  suggestSlot,
  type Category,
} from "@/lib/domain";
import type { AdminListTable } from "@/lib/admin-list-references";
import { todayIso } from "@/lib/format";
import { NAME_MAX } from "@/lib/schemas/common";
import { useRefusal } from "@/lib/use-refusal";
import { createClient } from "@/lib/supabase/client";
import { archiveRowAction, deleteRowAction, renameRowAction } from "@/app/(app)/settings/actions";
import { createProductAction, createSupplierAction, saveBatchAction } from "./actions";

type Product = { id: string; name: string; abbreviation: string; category: string };
type Supplier = { id: string; name: string; phone: string | null };
type RecentStack = { slot: string | null; stack_number: string | null };
type StackDraft = { slot: string; stackNumber: string };
type ProductDraft = { id: string | null; name: string; abbreviation: string; category: Category };
type SupplierDraft = { id: string | null; name: string; phone: string };
type Removal = { table: AdminListTable; id: string; name: string };

type Props = {
  readonly products: readonly Product[];
  readonly suppliers: readonly Supplier[];
  readonly recentStacks: readonly RecentStack[];
  readonly canManage: boolean;
};

type FormState = {
  purchaseDate: string;
  supplierId: string | null;
  productId: string | null;
  lengthFt: string;
  breadthFt: string;
  thicknessMm: string;
  slot: string | null;
  stackNumber: string;
  initialUnits: string;
  unitPurchasePrice: string;
};

const EMPTY: FormState = {
  purchaseDate: todayIso(),
  supplierId: null,
  productId: null,
  lengthFt: "",
  breadthFt: "",
  thicknessMm: "16",
  slot: null,
  stackNumber: "",
  initialUnits: "",
  unitPurchasePrice: "",
};

export function InwardForm({ products: initialProducts, suppliers: initialSuppliers, recentStacks, canManage }: Props) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const { error, refuse, clear } = useRefusal(form);
  const [products, setProducts] = useState(initialProducts);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [newProduct, setNewProduct] = useState<ProductDraft | null>(null);
  const [newSupplier, setNewSupplier] = useState<SupplierDraft | null>(null);
  const [newStack, setNewStack] = useState<StackDraft | null>(null);
  const [removing, setRemoving] = useState<Removal | null>(null);
  const [codePreview, setCodePreview] = useState<string | null>(null);

  const product = products.find((p) => p.id === form.productId) ?? null;
  const category: Category | null = product && isCategory(product.category) ? product.category : null;
  const memorial = category === "MEMORIAL";
  const lengthNumber = Number.parseFloat(form.lengthFt);
  const suggested = category ? suggestSlot(category, Number.isFinite(lengthNumber) ? lengthNumber : null) : null;
  const slot = form.slot ?? suggested;
  const hasSize = memorial || (lengthNumber > 0 && Number.parseFloat(form.breadthFt) > 0);

  const stackOptions = useMemo(() => {
    const pairs: StackDraft[] = recentStacks.flatMap((s) =>
      s.slot && s.stack_number ? [{ slot: s.slot, stackNumber: s.stack_number }] : [],
    );
    if (
      form.slot &&
      form.stackNumber &&
      !pairs.some((p) => p.slot === form.slot && p.stackNumber === form.stackNumber)
    ) {
      pairs.unshift({ slot: form.slot, stackNumber: form.stackNumber });
    }
    return pairs.map((p) => ({
      ...p,
      value: stackKey(p.slot, p.stackNumber),
      label: stackLabel(p.slot, p.stackNumber),
    }));
  }, [recentStacks, form.slot, form.stackNumber]);
  const stackValue = form.slot && form.stackNumber ? stackKey(form.slot, form.stackNumber) : null;
  const slots = slotChoices([...recentStacks.map((s) => s.slot), newStack?.slot ?? null]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!form.productId || !form.purchaseDate) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.rpc("preview_batch_code", { p_product_id: form.productId, p_date: form.purchaseDate }).then(({ data }) => {
      if (!cancelled) setCodePreview(typeof data === "string" ? data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [form.productId, form.purchaseDate]);
  const showPreview = form.productId && form.purchaseDate ? codePreview : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    clear();
    startTransition(async () => {
      const result = await saveBatchAction({
        productId: form.productId,
        supplierId: form.supplierId,
        purchaseDate: form.purchaseDate,
        slot,
        stackNumber: form.stackNumber,
        initialUnits: form.initialUnits,
        unitPurchasePrice: form.unitPurchasePrice,
        memorial,
        lengthFt: form.lengthFt,
        breadthFt: form.breadthFt,
        thicknessMm: form.thicknessMm,
      });
      if (!result.ok) {
        refuse(result.error);
        return;
      }
      toast.success(`Batch ${result.data.batch_code} saved`);
      setForm({ ...EMPTY, purchaseDate: todayIso(), supplierId: form.supplierId });
      afterWrite();
    });
  }

  function saveSupplier() {
    if (!newSupplier) return;
    const { id, ...draft } = newSupplier;
    startTransition(async () => {
      if (id) {
        const result = await renameRowAction({ table: "suppliers", id, ...draft });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const saved = { id, name: draft.name.trim(), phone: draft.phone.trim() || null };
        setSuppliers((prev) => byName(prev.map((s) => (s.id === id ? saved : s))));
        toast.success(`Supplier ${saved.name} saved`);
        setNewSupplier(null);
        afterWrite();
        return;
      }
      const result = await createSupplierAction(draft);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSuppliers((prev) => byName([...prev, result.data]));
      set("supplierId", result.data.id);
      setNewSupplier(null);
    });
  }

  function saveProduct() {
    if (!newProduct) return;
    const { id, ...draft } = newProduct;
    startTransition(async () => {
      if (id) {
        const result = await renameRowAction({ table: "products", id, ...draft });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const saved = {
          id,
          name: draft.name.trim(),
          abbreviation: draft.abbreviation.trim(),
          category: draft.category,
        };
        setProducts((prev) => byName(prev.map((p) => (p.id === id ? saved : p))));
        toast.success(`Product ${saved.name} saved`);
        setNewProduct(null);
        afterWrite();
        return;
      }
      const result = await createProductAction(draft);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setProducts((prev) => byName([...prev, result.data]));
      set("productId", result.data.id);
      setNewProduct(null);
    });
  }

  function forget(table: AdminListTable, id: string) {
    if (table === "products") {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setForm((prev) => (prev.productId === id ? { ...prev, productId: null } : prev));
    } else {
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      setForm((prev) => (prev.supplierId === id ? { ...prev, supplierId: null } : prev));
    }
  }

  function archive(table: AdminListTable, option: SearchOption) {
    startTransition(async () => {
      const result = await archiveRowAction(table, option.value, true);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      forget(table, option.value);
      toast.success(`${option.label} archived`);
      afterWrite();
    });
  }

  function remove() {
    if (!removing) return;
    const { table, id, name } = removing;
    setRemoving(null);
    startTransition(async () => {
      const result = await deleteRowAction(table, id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      forget(table, id);
      toast.success(`${name} deleted`);
      afterWrite();
    });
  }

  function edit(table: AdminListTable, id: string) {
    if (table === "products") {
      const p = products.find((row) => row.id === id);
      if (p) setNewProduct({ ...p, category: isCategory(p.category) ? p.category : "GRANITE" });
    } else {
      const s = suppliers.find((row) => row.id === id);
      if (s) setNewSupplier({ id: s.id, name: s.name, phone: s.phone ?? "" });
    }
  }

  const listActions = (table: AdminListTable): readonly OptionAction[] | undefined =>
    canManage
      ? [
          { label: "Edit", icon: Pencil, onSelect: (o) => edit(table, o.value) },
          { label: "Archive", icon: Archive, onSelect: (o) => archive(table, o) },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: (o) => setRemoving({ table, id: o.value, name: o.label }),
          },
        ]
      : undefined;

  return (
    <form onSubmit={submit} className="rounded-card bg-card p-6 shadow-sm md:p-8" noValidate>
      <h2 className="text-base font-semibold">Log New Purchase</h2>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Purchase Date" htmlFor="purchaseDate">
          <Input
            id="purchaseDate"
            type="date"
            required
            max={todayIso()}
            value={form.purchaseDate}
            onChange={(e) => set("purchaseDate", e.target.value)}
            className="h-11"
          />
        </Field>
        <Field label="Supplier" htmlFor="supplier">
          <div className="flex gap-2">
            <SearchSelect
              id="supplier"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={form.supplierId}
              onChange={(v) => set("supplierId", v)}
              placeholder="Select or add supplier"
              searchPlaceholder="Search suppliers..."
              onCreate={(name) => setNewSupplier({ id: null, name, phone: "" })}
              createLabel={(q) => `Add supplier "${q}"`}
              optionActions={listActions("suppliers")}
              className="min-w-0 flex-1"
            />
            <AddButton label="Add new supplier" onClick={() => setNewSupplier({ id: null, name: "", phone: "" })} />
          </div>
        </Field>
        <Field label="Product" htmlFor="product">
          <div className="flex gap-2">
            <SearchSelect
              id="product"
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
                hint: isCategory(p.category) ? CATEGORY_LABEL[p.category] : undefined,
                keywords: [p.abbreviation],
              }))}
              value={form.productId}
              onChange={(v) => {
                set("productId", v);
              }}
              placeholder="Select or add product"
              searchPlaceholder="Search products..."
              onCreate={(name) =>
                setNewProduct({ id: null, name, abbreviation: suggestAbbreviation(name), category: "GRANITE" })
              }
              createLabel={(q) => `Add product "${q}"`}
              optionActions={listActions("products")}
              className="min-w-0 flex-1"
            />
            <AddButton
              label="Add new product"
              onClick={() => setNewProduct({ id: null, name: "", abbreviation: "", category: "GRANITE" })}
            />
          </div>
        </Field>
      </div>

      {memorial ? (
        <Notice tone="accent" className="mt-4">
          Doom Stones have a fixed size and are tracked by unit count.
        </Notice>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Length (ft)" htmlFor="lengthFt">
            <Input
              id="lengthFt"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              placeholder="0"
              value={form.lengthFt}
              onChange={(e) => {
                set("lengthFt", e.target.value);
              }}
              className="h-11"
            />
          </Field>
          <Field label="Breadth (ft)" htmlFor="breadthFt">
            <Input
              id="breadthFt"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              placeholder="0"
              value={form.breadthFt}
              onChange={(e) => set("breadthFt", e.target.value)}
              className="h-11"
            />
          </Field>
          <Field label="Thickness (mm)" htmlFor="thicknessMm">
            <Input
              id="thicknessMm"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              placeholder="0"
              value={form.thicknessMm}
              onChange={(e) => set("thicknessMm", e.target.value)}
              className="h-11"
            />
          </Field>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Unit Quantity" htmlFor="initialUnits">
          <Input
            id="initialUnits"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            placeholder="0"
            value={form.initialUnits}
            onChange={(e) => set("initialUnits", e.target.value)}
            className="h-11"
          />
        </Field>
        <Field label="Unit Purchase Price (₹)" htmlFor="unitPurchasePrice" hint="Per piece, freight included">
          <Input
            id="unitPurchasePrice"
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            placeholder="0"
            value={form.unitPurchasePrice}
            onChange={(e) => set("unitPurchasePrice", e.target.value)}
            className="h-11"
          />
        </Field>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Yard slot and batch number" htmlFor="stack">
          <div className="flex gap-2">
            <SearchSelect
              id="stack"
              options={stackOptions}
              value={stackValue}
              onChange={(v) => {
                const picked = stackOptions.find((o) => o.value === v);
                if (picked) setForm((prev) => ({ ...prev, slot: picked.slot, stackNumber: picked.stackNumber }));
              }}
              placeholder="Pick or add a batch number"
              searchPlaceholder="Search batch numbers..."
              emptyText="No recent batch number matches."
              onCreate={(stackNumber) => setNewStack({ slot: slot ?? "4FT", stackNumber })}
              createLabel={(q) => `Add batch number "${q}"`}
              className="min-w-0 flex-1"
            />
            <AddButton
              label="Add new batch number"
              onClick={() => setNewStack({ slot: slot ?? "4FT", stackNumber: "" })}
            />
          </div>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">Purchase code</span>
          <span className="flex h-11 items-center font-mono text-sm font-semibold" data-testid="batch-code-preview">
            {showPreview ?? "Pick a product and date"}
          </span>
        </div>
      </div>

      {error ? (
        <Notice tone="error" icon="alert" className="mt-4">
          {error}
        </Notice>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button
          type="submit"
          disabled={pending || !form.productId || !form.supplierId || !hasSize || !form.stackNumber}
          className="h-11 px-6 font-semibold"
        >
          {pending ? "Saving..." : "Save Batch"}
        </Button>
      </div>

      <Dialog
        open={newProduct !== null}
        onOpenChange={(open) => {
          if (!open) setNewProduct(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newProduct?.id ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          {newProduct ? (
            <div className="flex flex-col gap-4">
              <Field label="Name" htmlFor="np-name">
                <Input
                  id="np-name"
                  maxLength={NAME_MAX}
                  value={newProduct.name}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      name: e.target.value,
                      abbreviation: newProduct.id ? newProduct.abbreviation : suggestAbbreviation(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Abbreviation" htmlFor="np-abbr" hint="Used in batch codes, e.g. BP-07SEP26-01">
                <Input
                  id="np-abbr"
                  maxLength={4}
                  value={newProduct.abbreviation}
                  onChange={(e) => setNewProduct({ ...newProduct, abbreviation: e.target.value.toUpperCase() })}
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Category" htmlFor="np-category">
                <Select
                  value={newProduct.category}
                  onValueChange={(v) => {
                    if (isCategory(v)) setNewProduct({ ...newProduct, category: v });
                  }}
                >
                  <SelectTrigger id="np-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewProduct(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveProduct} disabled={pending}>
                  {newProduct.id ? "Save product" : "Add product"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={newSupplier !== null}
        onOpenChange={(open) => {
          if (!open) setNewSupplier(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newSupplier?.id ? "Edit supplier" : "New supplier"}</DialogTitle>
          </DialogHeader>
          {newSupplier ? (
            <div className="flex flex-col gap-4">
              <Field label="Name" htmlFor="ns-name">
                <Input
                  id="ns-name"
                  maxLength={NAME_MAX}
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  autoFocus={!newSupplier.name}
                />
              </Field>
              <Field label="Phone" htmlFor="ns-phone" hint="Optional">
                <Input
                  id="ns-phone"
                  inputMode="tel"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewSupplier(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveSupplier} disabled={pending || !newSupplier.name.trim()}>
                  {newSupplier.id ? "Save supplier" : "Add supplier"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={newStack !== null}
        onOpenChange={(open) => {
          if (!open) setNewStack(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New batch number</DialogTitle>
          </DialogHeader>
          {newStack ? (
            <div className="flex flex-col gap-4">
              <Field
                label="Yard slot"
                htmlFor="nk-slot"
                hint={suggested && newStack.slot === suggested ? "Suggested from size" : undefined}
              >
                <SearchSelect
                  id="nk-slot"
                  options={slots.map((s) => ({ value: s, label: slotLabel(s) }))}
                  value={newStack.slot}
                  onChange={(v) => setNewStack({ ...newStack, slot: v })}
                  placeholder="Pick or add a yard slot"
                  searchPlaceholder="Search or type a slot..."
                  onCreate={(name) => setNewStack({ ...newStack, slot: name })}
                  createLabel={(q) => `Add slot "${q}"`}
                />
              </Field>
              <Field label="Batch number" htmlFor="nk-number" hint="As written on the pile in the yard">
                <Input
                  id="nk-number"
                  maxLength={20}
                  value={newStack.stackNumber}
                  onChange={(e) => setNewStack({ ...newStack, stackNumber: e.target.value })}
                  autoFocus
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewStack(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!newStack.stackNumber.trim()}
                  onClick={() => {
                    setForm((prev) => ({ ...prev, slot: newStack.slot, stackNumber: newStack.stackNumber.trim() }));
                    setNewStack(null);
                  }}
                >
                  Use batch number
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only possible when no batch uses it. One that is still in use can be archived instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function stackKey(slot: string, stackNumber: string): string {
  return JSON.stringify([slot, stackNumber]);
}

function byName<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}
