"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, type CustomerType } from "@/lib/domain";
import type { Tables } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions";

export type CustomerDraft = { readonly name: string; readonly phone: string; readonly customerType: CustomerType };

type Props = {
  readonly draft: CustomerDraft | null;
  readonly existingId?: string;
  readonly onClose: () => void;
  readonly onSaved: (customer: Tables<"customers">) => void;
};

/* Add or edit a Customer. Shared by the Sell form, the Customers list and the detail page. */
export function CustomerDialog({ draft, existingId, onClose, onSaved }: Props) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingId ? "Edit customer" : "New customer"}</DialogTitle>
        </DialogHeader>
        {draft ? <CustomerForm initial={draft} existingId={existingId} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({
  initial,
  existingId,
  onClose,
  onSaved,
}: {
  initial: CustomerDraft;
  existingId?: string;
  onClose: () => void;
  onSaved: (customer: Tables<"customers">) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<CustomerDraft>(initial);

  function save() {
    startTransition(async () => {
      const result = existingId
        ? await updateCustomerAction({ ...form, id: existingId })
        : await createCustomerAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (!existingId && "existed" in result.data && result.data.existed) {
        toast.info(`${result.data.name} already has that phone number, selected instead`);
      }
      onSaved(result.data);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" htmlFor="cd-name">
        <Input id="cd-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!form.name} />
      </Field>
      <Field label="Phone" htmlFor="cd-phone" hint="Optional. Phone numbers are unique per customer.">
        <Input id="cd-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Type">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
          {CUSTOMER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={form.customerType === t}
              onClick={() => setForm({ ...form, customerType: t })}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium",
                form.customerType === t ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {CUSTOMER_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={save} disabled={pending || !form.name.trim()}>
          {existingId ? "Save" : "Add customer"}
        </Button>
      </div>
    </div>
  );
}
