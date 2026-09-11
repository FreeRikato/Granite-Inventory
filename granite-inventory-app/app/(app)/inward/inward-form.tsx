"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { SearchSelect } from "@/components/search-select";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  SLOTS,
  SLOT_LABEL,
  isCategory,
  suggestAbbreviation,
  suggestSlot,
  type Category,
  type Slot,
} from "@/lib/domain";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { createProductAction, createSupplierAction, saveBatchAction } from "./actions";

type Product = { id: string; name: string; abbreviation: string; category: string };
type Variant = { id: string; product_id: string; name: string };
type Supplier = { id: string; name: string };

type Props = {
  readonly products: readonly Product[];
  readonly variants: readonly Variant[];
  readonly suppliers: readonly Supplier[];
};

type FormState = {
  purchaseDate: string;
  supplierId: string | null;
  productId: string | null;
  variantName: string;
  lengthFt: string;
  breadthFt: string;
  thicknessMm: string;
  slot: Slot | null;
  initialUnits: string;
  unitPurchasePrice: string;
  freightCost: string;
};

const EMPTY: FormState = {
  purchaseDate: todayIso(),
  supplierId: null,
  productId: null,
  variantName: "",
  lengthFt: "",
  breadthFt: "",
  thicknessMm: "16",
  slot: null,
  initialUnits: "",
  unitPurchasePrice: "",
  freightCost: "",
};

export function InwardForm({ products: initialProducts, variants: initialVariants, suppliers: initialSuppliers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [products, setProducts] = useState(initialProducts);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [variants] = useState(initialVariants);
  const [newProduct, setNewProduct] = useState<{ name: string; abbreviation: string; category: Category } | null>(null);
  const [codePreview, setCodePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const product = products.find((p) => p.id === form.productId) ?? null;
  const category: Category | null = product && isCategory(product.category) ? product.category : null;
  const memorial = category === "MEMORIAL";
  const lengthNumber = Number.parseFloat(form.lengthFt);
  const suggested = category ? suggestSlot(category, Number.isFinite(lengthNumber) ? lengthNumber : null) : null;
  const slot = form.slot ?? suggested;

  const variantExists = useMemo(() => {
    if (!form.productId || !form.variantName.trim()) return false;
    const wanted = form.variantName.trim().toLowerCase();
    return variants.some((v) => v.product_id === form.productId && v.name.toLowerCase() === wanted);
  }, [form.productId, form.variantName, variants]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!form.productId || !form.purchaseDate) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("preview_batch_code", { p_product_id: form.productId, p_date: form.purchaseDate })
      .then(({ data }) => {
        if (!cancelled) setCodePreview(typeof data === "string" ? data : null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.productId, form.purchaseDate]);
  const showPreview = form.productId && form.purchaseDate ? codePreview : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveBatchAction({
        productId: form.productId,
        variantName: form.variantName,
        supplierId: form.supplierId,
        purchaseDate: form.purchaseDate,
        slot,
        initialUnits: form.initialUnits,
        unitPurchasePrice: form.unitPurchasePrice,
        freightCost: form.freightCost === "" ? 0 : form.freightCost,
        memorial,
        lengthFt: form.lengthFt,
        breadthFt: form.breadthFt,
        thicknessMm: form.thicknessMm,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Batch ${result.data.batch_code} saved`);
      setForm({ ...EMPTY, purchaseDate: todayIso(), supplierId: form.supplierId });
      router.refresh();
    });
  }

  function addSupplier(name: string) {
    startTransition(async () => {
      const result = await createSupplierAction({ name });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSuppliers((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      set("supplierId", result.data.id);
    });
  }

  function saveProduct() {
    if (!newProduct) return;
    startTransition(async () => {
      const result = await createProductAction(newProduct);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setProducts((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      set("productId", result.data.id);
      setNewProduct(null);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-card bg-card p-6 shadow-sm md:p-8" noValidate>
      <h2 className="text-base font-semibold">Log New Purchase</h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
          <SearchSelect
            id="supplier"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={form.supplierId}
            onChange={(v) => set("supplierId", v)}
            placeholder="Select or add supplier"
            searchPlaceholder="Search suppliers..."
            onCreate={addSupplier}
            createLabel={(q) => `Add supplier "${q}"`}
          />
        </Field>
        <Field label="Product" htmlFor="product">
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
              set("slot", null);
            }}
            placeholder="Select or add product"
            searchPlaceholder="Search products..."
            onCreate={(name) =>
              setNewProduct({ name, abbreviation: suggestAbbreviation(name), category: "GRANITE" })
            }
            createLabel={(q) => `Add product "${q}"`}
          />
        </Field>
        <Field label="Variant Name" htmlFor="variantName">
          <Input
            id="variantName"
            placeholder="e.g. Grade 1, Mirror Polish"
            value={form.variantName}
            onChange={(e) => set("variantName", e.target.value)}
            className="h-11"
            autoComplete="off"
          />
        </Field>
      </div>

      {variantExists ? (
        <Notice tone="accent" icon="alert" className="mt-4">
          Existing variant found. This purchase becomes a new batch, never merged with existing stock.
        </Notice>
      ) : null}

      {memorial ? (
        <Notice tone="accent" className="mt-4">
          Doom Stones have a fixed size and are tracked by unit count.
        </Notice>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Length (ft)" htmlFor="lengthFt">
            <Input id="lengthFt" type="number" inputMode="decimal" step="0.25" min="0" placeholder="0" value={form.lengthFt}
              onChange={(e) => { set("lengthFt", e.target.value); set("slot", null); }} className="h-11" />
          </Field>
          <Field label="Breadth (ft)" htmlFor="breadthFt">
            <Input id="breadthFt" type="number" inputMode="decimal" step="0.25" min="0" placeholder="0" value={form.breadthFt}
              onChange={(e) => set("breadthFt", e.target.value)} className="h-11" />
          </Field>
          <Field label="Thickness (mm)" htmlFor="thicknessMm">
            <Input id="thicknessMm" type="number" inputMode="numeric" step="1" min="0" placeholder="0" value={form.thicknessMm}
              onChange={(e) => set("thicknessMm", e.target.value)} className="h-11" />
          </Field>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Unit Quantity" htmlFor="initialUnits">
          <Input id="initialUnits" type="number" inputMode="numeric" step="1" min="1" placeholder="0" value={form.initialUnits}
            onChange={(e) => set("initialUnits", e.target.value)} className="h-11" />
        </Field>
        <Field label="Unit Purchase Price (₹)" htmlFor="unitPurchasePrice">
          <Input id="unitPurchasePrice" type="number" inputMode="decimal" step="1" min="0" placeholder="0" value={form.unitPurchasePrice}
            onChange={(e) => set("unitPurchasePrice", e.target.value)} className="h-11" />
        </Field>
        <Field label="Misc / Freight Cost (₹)" htmlFor="freightCost" hint="Spread across the pieces into landed cost">
          <Input id="freightCost" type="number" inputMode="decimal" step="1" min="0" placeholder="Optional" value={form.freightCost}
            onChange={(e) => set("freightCost", e.target.value)} className="h-11" />
        </Field>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Yard slot" htmlFor="slot" hint={suggested && slot === suggested ? "Suggested from size" : undefined}>
          <Select value={slot ?? ""} onValueChange={(v) => set("slot", SLOTS.includes(v as Slot) ? (v as Slot) : null)}>
            <SelectTrigger id="slot" className="h-11 w-full">
              <SelectValue placeholder="Pick a product first" />
            </SelectTrigger>
            <SelectContent>
              {SLOTS.map((s) => (
                <SelectItem key={s} value={s}>{SLOT_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">Auto-generated batch ID</span>
          <span className="flex h-11 items-center font-mono text-sm font-semibold" data-testid="batch-code-preview">
            {showPreview ?? "Pick a product and date"}
          </span>
        </div>
      </div>

      {error ? (
        <Notice tone="error" icon="alert" className="mt-4">{error}</Notice>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={pending} className="h-11 px-6 font-semibold">
          {pending ? "Saving..." : "Save Batch"}
        </Button>
      </div>

      <Dialog open={newProduct !== null} onOpenChange={(open) => { if (!open) setNewProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New product</DialogTitle>
          </DialogHeader>
          {newProduct ? (
            <div className="flex flex-col gap-4">
              <Field label="Name" htmlFor="np-name">
                <Input id="np-name" value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value, abbreviation: suggestAbbreviation(e.target.value) })} />
              </Field>
              <Field label="Abbreviation" htmlFor="np-abbr" hint="Used in batch codes, e.g. BP-07SEP26-01">
                <Input id="np-abbr" maxLength={4} value={newProduct.abbreviation}
                  onChange={(e) => setNewProduct({ ...newProduct, abbreviation: e.target.value.toUpperCase() })} className="font-mono uppercase" />
              </Field>
              <Field label="Category" htmlFor="np-category">
                <Select value={newProduct.category} onValueChange={(v) => { if (isCategory(v)) setNewProduct({ ...newProduct, category: v }); }}>
                  <SelectTrigger id="np-category" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewProduct(null)}>Cancel</Button>
                <Button type="button" onClick={saveProduct} disabled={pending}>Add product</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </form>
  );
}
