"use client";

import { useState } from "react";
import { useAfterWrite } from "@/lib/query/provider";
import { Plus } from "lucide-react";
import { CustomerDialog, type CustomerDraft } from "@/components/customer-dialog";
import { useCanWrite } from "@/components/shell/member-provider";
import { Button } from "@/components/ui/button";

export function AddCustomerButton() {
  const afterWrite = useAfterWrite();
  const canWrite = useCanWrite();
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  if (!canWrite) return null;
  return (
    <>
      <Button className="h-10 font-semibold" onClick={() => setDraft({ name: "", phone: "", customerType: "REGULAR" })}>
        <Plus className="size-4" /> Add Customer
      </Button>
      <CustomerDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          afterWrite("add-customer");
        }}
      />
    </>
  );
}
