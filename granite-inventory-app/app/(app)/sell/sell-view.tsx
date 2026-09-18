"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { customersQuery, stockLinesQuery, yardBatchesQuery } from "@/lib/query/reads";
import { useHydrated } from "@/lib/query/provider";
import { ViewError, ViewSkeleton } from "@/components/view-state";
import { SellForm } from "./sell-form";

export function SellView() {
  const preselect = useSearchParams().get("batch");
  const hydrated = useHydrated();
  const customers = useQuery(customersQuery);
  const lines = useQuery(stockLinesQuery);
  const batches = useQuery(yardBatchesQuery);

  if (!hydrated || !customers.isSuccess || !lines.isSuccess || !batches.isSuccess) {
    const failed = [customers, lines, batches].find((q) => q.isError);
    if (failed?.isError) {
      return <ViewError what="the sell form" message={failed.error.message} />;
    }
    return <ViewSkeleton />;
  }

  /* The Sell form wants sellable batches oldest first; Yard wants every batch, so the shared
     query carries all of them and the narrowing happens here. */
  const sellable = batches.data
    .filter((b) => (b.available ?? 0) > 0)
    .sort((a, b) => (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "") || (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  const fetching = customers.isFetching || lines.isFetching || batches.isFetching;
  const updatedAt = Math.min(customers.dataUpdatedAt, lines.dataUpdatedAt, batches.dataUpdatedAt);
  return (
    <>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={updatedAt} fetching={fetching} />
      </div>
      <SellForm customers={customers.data} lines={lines.data} batches={sellable} preselectBatchId={preselect} />
    </>
  );
}
