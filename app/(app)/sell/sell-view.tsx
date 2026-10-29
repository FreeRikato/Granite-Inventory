"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { customersQuery, stockLinesQuery, yardBatchesQuery } from "@/lib/query/reads";
import { useHydrated } from "@/lib/query/provider";
import { ViewError, ViewReady } from "@/components/view-state";
import { SellForm } from "./sell-form";

export function SellView({ skeleton }: { readonly skeleton: ReactNode }) {
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
    return skeleton;
  }

  const sellable = batches.data
    .filter((b) => (b.available ?? 0) > 0 && !b.archived_at)
    .sort(
      (a, b) =>
        (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "") ||
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    );

  const fetching = customers.isFetching || lines.isFetching || batches.isFetching;
  const updatedAt = Math.min(customers.dataUpdatedAt, lines.dataUpdatedAt, batches.dataUpdatedAt);
  return (
    <ViewReady>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={updatedAt} fetching={fetching} />
      </div>
      <SellForm customers={customers.data} lines={lines.data} batches={sellable} preselectBatchId={preselect} />
    </ViewReady>
  );
}
