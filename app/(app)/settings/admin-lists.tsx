"use client";

import { useState, useTransition } from "react";
import { useAfterWrite } from "@/lib/query/provider";
import { Archive, ArchiveRestore, Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteBlockedMessage,
  referencesForTable,
  type AdminListTable,
  type BatchReference,
} from "@/lib/admin-list-references";
import { CATEGORIES, CATEGORY_LABEL, isCategory } from "@/lib/domain";
import { archiveRowAction, deleteRowAction, renameRowAction } from "./actions";

type Product = { id: string; name: string; abbreviation: string; category: string; archived_at: string | null };
type Supplier = { id: string; name: string; archived_at: string | null };

type Props = {
  readonly products: readonly Product[];
  readonly suppliers: readonly Supplier[];
  readonly batchReferences: readonly BatchReference[];
};

export function AdminLists({ products, suppliers, batchReferences }: Props) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Products and suppliers</h2>
      <p className="text-sm text-muted-foreground">
        Rename typos here; it updates every batch. Archived rows leave the Inward pickers. Rows still used by batches
        cannot be deleted; archive them instead.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <ListBlock title="Products">
          {products.map((p) => (
            <EditableRow
              key={p.id}
              table="products"
              id={p.id}
              name={p.name}
              meta={`${p.abbreviation} · ${isCategory(p.category) ? CATEGORY_LABEL[p.category] : p.category}${p.archived_at ? " · Archived" : ""}`}
              archived={Boolean(p.archived_at)}
              extra={{ abbreviation: p.abbreviation, category: p.category }}
              batchReferences={batchReferences}
            />
          ))}
        </ListBlock>
        <ListBlock title="Suppliers">
          {suppliers.map((s) => (
            <EditableRow
              key={s.id}
              table="suppliers"
              id={s.id}
              name={s.name}
              meta={s.archived_at ? "Archived" : undefined}
              archived={Boolean(s.archived_at)}
              batchReferences={batchReferences}
            />
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
  archived,
  extra,
  batchReferences,
}: {
  table: AdminListTable;
  id: string;
  name: string;
  meta?: string;
  archived: boolean;
  extra?: { abbreviation: string; category: string };
  batchReferences: readonly BatchReference[];
}) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name,
    abbreviation: extra?.abbreviation ?? "",
    category: extra?.category ?? "",
  });
  const blockingBatches = referencesForTable(table, id, batchReferences);

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
      afterWrite();
    });
  }

  function toggleArchive() {
    startTransition(async () => {
      const result = await archiveRowAction(table, id, !archived);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(archived ? "Unarchived" : "Archived");
      afterWrite();
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
      afterWrite();
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-2">
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          aria-label={`Name for ${name}`}
          className="h-8"
        />
        {extra ? (
          <div className="flex gap-2">
            <Input
              value={draft.abbreviation}
              maxLength={4}
              onChange={(e) => setDraft({ ...draft, abbreviation: e.target.value.toUpperCase() })}
              aria-label="Abbreviation"
              className="h-8 w-24 font-mono uppercase"
            />
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger className="h-8 flex-1" aria-label="Category">
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
          </div>
        ) : null}
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="size-4" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending || !draft.name.trim()}>
            <Check className="size-4" /> Save
          </Button>
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
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)} aria-label={`Rename ${name}`}>
        <Pencil className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8"
        onClick={toggleArchive}
        disabled={pending}
        aria-label={`${archived ? "Unarchive" : "Archive"} ${name}`}
      >
        {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
      </Button>
      <ConfirmDelete
        title={`Delete ${name}?`}
        description={deleteBlockedMessage(table, blockingBatches, name)}
        onConfirm={remove}
        disabled={pending}
      />
    </li>
  );
}
