"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAfterWrite } from "@/lib/query/provider";
import { RowMark, useRowRemoval } from "@/lib/query/row-state";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerDialog, type CustomerDraft } from "@/components/customer-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { isCustomerType } from "@/lib/domain";
import { deleteCustomerAction } from "../actions";

type Props = {
  readonly customer: { id: string; name: string; phone: string | null; customer_type: string; is_walk_in: boolean };
  readonly canDelete: boolean;
};

export function CustomerActions({ customer, canDelete }: Props) {
  const router = useRouter();
  const afterWrite = useAfterWrite();
  const removal = useRowRemoval("delete-customer");
  const [draft, setDraft] = useState<CustomerDraft | null>(null);

  function remove() {
    removal.remove(
      () => deleteCustomerAction(customer.id),
      "Customer deleted",
      () => {
        afterWrite("delete-customer");
        router.push("/customers");
      },
    );
  }

  return (
    <div className="flex items-center gap-2">
      <RowMark state={removal.state} />
      {!customer.is_walk_in ? (
        <Button
          variant="outline"
          className="bg-card"
          onClick={() =>
            setDraft({
              name: customer.name,
              phone: customer.phone ?? "",
              customerType: isCustomerType(customer.customer_type) ? customer.customer_type : "REGULAR",
            })
          }
        >
          <Pencil className="size-4" /> Edit
        </Button>
      ) : null}
      {canDelete ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="bg-card text-stale" disabled={removal.pending}>
              {removal.pending ? <Spinner aria-hidden /> : <Trash2 className="size-4" />} Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
              <AlertDialogDescription>This customer has no sales, so nothing else is affected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      <CustomerDialog
        draft={draft}
        existingId={customer.id}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          toast.success("Customer updated");
          afterWrite("edit-customer");
        }}
      />
    </div>
  );
}
