"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { customersQuery, stockLinesQuery, yardBatchesQuery } from "@/lib/query/reads";
import { SellForm } from "./sell-form";

export function SellView() {
  const preselect = useSearchParams().get("batch");
  const customers = useQuery(customersQuery);
  const lines = useQuery(stockLinesQuery);
  const batches = useQuery(yardBatchesQuery);

  if (!customers.isSuccess || !lines.isSuccess || !batches.isSuccess) {
    const failed = [customers, lines, batches].find((q) => q.isError);
    if (failed?.isError) {
      return <p className="py-8 text-center text-sm text-destructive">Could not load the sell form: {failed.error.message}</p>;
    }
    return (
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
        <div className="h-48 rounded-card bg-card shadow-sm" />
        <div className="h-64 rounded-card bg-card shadow-sm" />
      </div>
    );
  }

  /* The Sell form wants sellable batches oldest first; Yard wants every batch, so the shared
     query carries all of them and the narrowing happens here. */
  const sellable = batches.data
    .filter((b) => (b.available ?? 0) > 0)
    .sort((a, b) => (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "") || (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  return <SellForm customers={customers.data} lines={lines.data} batches={sellable} preselectBatchId={preselect} />;
}
