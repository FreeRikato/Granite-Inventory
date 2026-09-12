"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteBlockedMessage, referencesForTable, type AdminListTable, type BatchReference, type VariantReference } from "@/lib/admin-list-references";
import { CATEGORIES, CATEGORY_LABEL, isCategory } from "@/lib/domain";
import { deleteRowAction, renameRowAction } from "./actions";

type Product = { id: string; name: string; abbreviation: string; category: string };
type Variant = VariantReference;
type Supplier = { id: string; name: string };

type Props = {
  readonly products: readonly Product[];
  readonly variants: readonly Variant[];
  readonly suppliers: readonly Supplier[];
  readonly batchReferences: readonly BatchReference[];
};

/* Rename and guarded delete for the three lists that grow from the inward form. */
export function AdminLists({ products, variants, suppliers, batchReferences }: Props) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Products, variants and suppliers</h2>
      <p className="text-sm text-muted-foreground">Rename typos here; it updates every batch. Rows still used by batches cannot be deleted.</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <ListBlock title="Products">
          {products.map((p) => (
            <EditableRow
              key={p.id}
              table="products"
              id={p.id}
              name={p.name}
              meta={`${p.abbreviation} · ${isCategory(p.category) ? CATEGORY_LABEL[p.category] : p.category}`}
              extra={{ abbreviation: p.abbreviation, category: p.category }}
              batchReferences={batchReferences}
              variantReferences={variants.filter((v) => v.product_id === p.id)}
            />
          ))}
        </ListBlock>
        <ListBlock title="Variants">
          {variants.map((v) => (
            <EditableRow
              key={v.id}
              table="variants"
              id={v.id}
              name={v.name}
              meta={products.find((p) => p.id === v.product_id)?.name ?? ""}
              batchReferences={batchReferences}
            />
          ))}
        </ListBlock>
        <ListBlock title="Suppliers">
          {suppliers.map((s) => (
            <EditableRow key={s.id} table="suppliers" id={s.id} name={s.name} batchReferences={batchReferences} />
          ))}
        </ListBlock>
      </div>
    </section>
  );
}

function ListBlock({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border-t border-border">{children}</ul>
      )}
    </div>
  );
}

function EditableRow({
  table,
  id,
  name,
  meta,
  extra,
  batchReferences,
  variantReferences,
}: {
  table: AdminListTable;
  id: string;
  name: string;
  meta?: string;
  extra?: { abbreviation: string; category: string };
  batchReferences: readonly BatchReference[];
  variantReferences?: readonly VariantReference[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name, abbreviation: extra?.abbreviation ?? "", category: extra?.category ?? "" });
  const blockingBatches = referencesForTable(table, id, batchReferences);
  const blockingVariants = table === "products" ? variantReferences ?? [] : [];

  function save() {
    startTransition(async () => {
      const result = await renameRowAction({
        table,
        id,
        name: draft.name,
        ...(extra && { abbreviation: draft.abbreviation, category: draft.category }),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteRowAction(table, id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Deleted");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-2">
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label={`Name for ${name}`} className="h-8" />
        {extra ? (
          <div className="flex gap-2">
            <Input value={draft.abbreviation} maxLength={4} onChange={(e) => setDraft({ ...draft, abbreviation: e.target.value.toUpperCase() })} aria-label="Abbreviation" className="h-8 w-24 font-mono uppercase" />
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger className="h-8 flex-1" aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="size-4" /> Cancel</Button>
          <Button size="sm" onClick={save} disabled={pending || !draft.name.trim()}><Check className="size-4" /> Save</Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2" data-testid={`${table}-row`}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)} aria-label={`Rename ${name}`}><Pencil className="size-4" /></Button>
      <ConfirmDelete
        title={`Delete ${name}?`}
        description={deleteBlockedMessage(table, blockingBatches, blockingVariants, name)}
        onConfirm={remove}
        disabled={pending}
      />
    </li>
  );
}
