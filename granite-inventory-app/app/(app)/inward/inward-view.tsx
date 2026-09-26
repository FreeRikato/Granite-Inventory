"use client";

import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { Notice } from "@/components/notice";
import { ViewError, ViewSkeleton } from "@/components/view-state";
import { useHydrated } from "@/lib/query/provider";
import { productsQuery, recentBatchesQuery, suppliersQuery, variantsQuery } from "@/lib/query/reads";
import { InwardForm } from "./inward-form";
import { RecentBatches } from "./recent-batches";

export function InwardView() {
  const hydrated = useHydrated();
  const products = useQuery(productsQuery);
  const variants = useQuery(variantsQuery);
  const suppliers = useQuery(suppliersQuery);
  const recent = useQuery(recentBatchesQuery);

  if (!hydrated || !products.isSuccess || !variants.isSuccess || !suppliers.isSuccess || !recent.isSuccess) {
    const failed = [products, variants, suppliers, recent].find((q) => q.isError);
    if (failed?.isError) return <ViewError what="the inward form" message={failed.error.message} />;
    return <ViewSkeleton />;
  }

  const fetching = products.isFetching || variants.isFetching || suppliers.isFetching || recent.isFetching;
  const updatedAt = Math.min(products.dataUpdatedAt, variants.dataUpdatedAt, suppliers.dataUpdatedAt, recent.dataUpdatedAt);

  return (
    <>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={updatedAt} fetching={fetching} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <InwardForm products={products.data} variants={variants.data} suppliers={suppliers.data} />
        <Notice className="h-fit">
          Batches are never merged. Every purchase becomes its own tracked lot, even if it&apos;s
          the same product and size as existing stock.
        </Notice>
      </div>
      <RecentBatches batches={recent.data} />
    </>
  );
}
