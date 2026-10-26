"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { useMember } from "@/components/shell/member-provider";
import { BatchActions, type EditLists } from "@/components/yard/batch-actions";
import { BatchCard } from "@/components/yard/batch-card";
import { Clamp } from "@/components/yard/clamp";
import { YardFilters } from "@/components/yard/yard-filters";
import { SLOTS, SLOT_LABEL, stackLabel } from "@/lib/domain";
import { productsQuery, suppliersQuery, yardBatchesQuery } from "@/lib/query/reads";
import { useHydrated } from "@/lib/query/provider";
import { ViewError, ViewSkeleton } from "@/components/view-state";
import { groupByStack, matchesFilters, parseYardQuery, sortBatches, type StackGroup, type YardBatch } from "@/lib/yard";

export function YardView() {
  const params = useSearchParams();
  const raw: Record<string, string> = Object.fromEntries(params.entries());
  const query = parseYardQuery(raw);
  const isAdmin = useMember().role === "ADMIN";
  const hydrated = useHydrated();
  const batches = useQuery(yardBatchesQuery);
  const products = useQuery(productsQuery);
  const suppliers = useQuery(suppliersQuery);

  if (!hydrated || batches.isPending) {
    return <ViewSkeleton />;
  }
  if (batches.isError) {
    return <ViewError what="the yard" message={batches.error.message} />;
  }

  const all: YardBatch[] = batches.data;
  const editLists: EditLists | null = isAdmin
    ? { products: products.data ?? [], suppliers: suppliers.data ?? [] }
    : null;

  const filtered = all.filter((b) => matchesFilters(b, query));
  const groups = groupByStack(filtered);
  const filtering = Boolean(
    query.q ||
    query.slot ||
    query.product ||
    query.thickness !== null ||
    query.supplier ||
    query.age !== null ||
    query.band ||
    query.line,
  );

  const productOptions = uniq(all.map((b) => [b.product_id ?? "", b.product_name ?? ""]));
  const supplierOptions = uniq(all.map((b) => [b.supplier_id ?? "", b.supplier_name ?? ""]));
  const slotOptions = SLOTS.map((slot) => ({ value: slot, label: SLOT_LABEL[slot] }));
  const thicknesses = [...new Set(all.map((b) => b.thickness_mm).filter((t): t is number => t !== null))].sort(
    (a, b) => a - b,
  );

  return (
    <>
      <YardFilters
        query={query}
        slots={slotOptions}
        products={productOptions}
        thicknesses={thicknesses}
        suppliers={supplierOptions}
      />

      <div className="-mt-3 flex justify-end">
        <DataAge updatedAt={batches.dataUpdatedAt} fetching={batches.isFetching} />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-card bg-card/60 py-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border">
          {all.length === 0
            ? "No batches in the yard yet. Log a delivery to get started."
            : filtering
              ? "Nothing matches these filters."
              : "No stock in the yard right now."}
        </p>
      ) : (
        groups.map((group) => <StackSection key={group.key} group={group} sort={query.sort} editLists={editLists} />)
      )}
    </>
  );
}

function StackSection({
  group,
  sort,
  editLists,
}: {
  group: StackGroup;
  sort: "oldest" | "newest";
  editLists: EditLists | null;
}) {
  const visible = sortBatches(group.batches, sort);
  const title = group.slot && group.stackNumber ? stackLabel(group.slot, group.stackNumber) : "No batch number";
  const count = group.batches.length;
  return (
    <section
      className="rounded-card bg-card/60 p-4 shadow-sm ring-1 ring-border md:p-6"
      aria-label={title}
      data-testid="yard-stack"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        <span className="text-sm text-muted-foreground tabular">
          {count} {count === 1 ? "purchase" : "purchases"} · {group.available} available
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {visible.map((batch, i) => {
          const prev = visible[i - 1];
          const sameLine = prev && prev.line_key === batch.line_key;
          const later = sort === "oldest" ? batch : prev;
          const gap = sameLine ? (later?.days_since_previous ?? null) : null;
          return (
            <div key={batch.id ?? batch.batch_code} className="flex flex-col gap-3">
              {gap !== null ? <Clamp days={gap} /> : null}
              <BatchCard
                batch={batch}
                actions={editLists ? <BatchActions batch={batch} lists={editLists} /> : undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function uniq(pairs: readonly (readonly [string, string])[]): { value: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [v, l] of pairs) if (v && !m.has(v)) m.set(v, l);
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
