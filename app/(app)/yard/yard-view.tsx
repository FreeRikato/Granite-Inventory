"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { useMember } from "@/components/shell/member-provider";
import { BatchActions, type EditLists } from "@/components/yard/batch-actions";
import { BatchCard } from "@/components/yard/batch-card";
import { Clamp } from "@/components/yard/clamp";
import { YardFilters } from "@/components/yard/yard-filters";
import { slotChoices, slotLabel, stackLabel } from "@/lib/domain";
import { productsQuery, suppliersQuery, yardBatchesQuery } from "@/lib/query/reads";
import { useHydrated } from "@/lib/query/provider";
import { ViewError, ViewReady } from "@/components/view-state";
import {
  WINDOW_AFTER,
  chunkStacks,
  groupByStack,
  matchesFilters,
  parseYardQuery,
  type StackChunk,
  type YardBatch,
} from "@/lib/yard";

export function YardView({ skeleton }: { readonly skeleton: ReactNode }) {
  const params = useSearchParams();
  const raw: Record<string, string> = Object.fromEntries(params.entries());
  const query = parseYardQuery(raw);
  const isAdmin = useMember().role === "ADMIN";
  const hydrated = useHydrated();
  const batches = useQuery(yardBatchesQuery);
  const products = useQuery(productsQuery);
  const suppliers = useQuery(suppliersQuery);

  const options = useMemo(() => filterOptions(batches.data ?? []), [batches.data]);

  if (!hydrated || batches.isPending) {
    return skeleton;
  }
  if (batches.isError) {
    return <ViewError what="the yard" message={batches.error.message} />;
  }

  const all: YardBatch[] = batches.data;
  const slots = slotChoices(all.map((b) => b.slot));
  const editLists: EditLists | null = isAdmin
    ? { products: products.data ?? [], suppliers: suppliers.data ?? [], slots }
    : null;

  const filtered = all.filter((b) => matchesFilters(b, query));
  const groups = groupByStack(filtered);
  const windowed = filtered.length > WINDOW_AFTER;
  const chunks = chunkStacks(groups, query.sort, windowed ? undefined : Infinity);
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

  const slotOptions = slots.map((slot) => ({ value: slot, label: slotLabel(slot) }));

  return (
    <ViewReady>
      <YardFilters
        query={query}
        slots={slotOptions}
        products={options.products}
        thicknesses={options.thicknesses}
        suppliers={options.suppliers}
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
        <StackList chunks={chunks} windowed={windowed} editLists={editLists} />
      )}
    </ViewReady>
  );
}

function frameClass({ leading, trailing }: StackChunk) {
  if (leading && trailing) return "rounded-card bg-card/60 p-4 shadow-sm ring-1 ring-border md:p-6";
  return [
    "border-x border-border bg-card/60 px-4 shadow-sm md:px-6",
    leading ? "rounded-t-card border-t pt-4 md:pt-6" : "pt-3",
    trailing ? "rounded-b-card border-b pb-4 md:pb-6" : "",
  ].join(" ");
}

function StackChunkSection({ chunk, editLists }: { chunk: StackChunk; editLists: EditLists | null }) {
  const { group } = chunk;
  const title = group.slot && group.stackNumber ? stackLabel(group.slot, group.stackNumber) : "No batch number";
  const count = group.batches.length;
  return (
    <section className={frameClass(chunk)} aria-label={chunk.leading ? title : undefined} data-testid="yard-stack">
      {chunk.leading ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">{title}</h2>
          <span className="text-sm text-muted-foreground tabular">
            {count} {count === 1 ? "purchase" : "purchases"} · {group.available} available
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {chunk.entries.map(({ batch, gap }) => (
          <div key={batch.id ?? batch.batch_code} className="flex flex-col gap-3">
            {gap !== null ? <Clamp days={gap} /> : null}
            <BatchCard
              batch={batch}
              actions={editLists ? <BatchActions batch={batch} lists={editLists} /> : undefined}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function StackList({
  chunks,
  windowed,
  editLists,
}: {
  chunks: readonly StackChunk[];
  windowed: boolean;
  editLists: EditLists | null;
}) {
  if (windowed) return <VirtualStacks chunks={chunks} editLists={editLists} />;
  return (
    <div className="flex flex-col gap-4">
      {chunks.map((chunk) => (
        <StackChunkSection key={chunk.key} chunk={chunk} editLists={editLists} />
      ))}
    </div>
  );
}

function VirtualStacks({ chunks, editLists }: { chunks: readonly StackChunk[]; editLists: EditLists | null }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin((listRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: chunks.length,
    estimateSize: () => 1000,
    overscan: 1,
    scrollMargin,
    getItemKey: (index) => chunks[index]?.key ?? index,
  });
  return (
    <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((item) => {
        const chunk = chunks[item.index];
        if (!chunk) return null;
        return (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className={`absolute left-0 top-0 w-full ${chunk.trailing ? "pb-4" : ""}`}
            style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
          >
            <StackChunkSection chunk={chunk} editLists={editLists} />
          </div>
        );
      })}
    </div>
  );
}

function filterOptions(all: readonly YardBatch[]) {
  return {
    products: uniq(all.map((b) => [b.product_id ?? "", b.product_name ?? ""])),
    suppliers: uniq(all.map((b) => [b.supplier_id ?? "", b.supplier_name ?? ""])),
    thicknesses: [...new Set(all.map((b) => b.thickness_mm).filter((t): t is number => t !== null))].sort(
      (a, b) => a - b,
    ),
  };
}

function uniq(pairs: readonly (readonly [string, string])[]): { value: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [v, l] of pairs) if (v && !m.has(v)) m.set(v, l);
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
