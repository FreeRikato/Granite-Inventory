import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { BatchActions, type EditLists } from "@/components/yard/batch-actions";
import { BatchCard } from "@/components/yard/batch-card";
import { Clamp } from "@/components/yard/clamp";
import { YardFilters } from "@/components/yard/yard-filters";
import { SLOTS, SLOT_LABEL, isSlot } from "@/lib/domain";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  matchesFilters,
  parseYardQuery,
  sizeKey,
  sizesIn,
  sortBatches,
  summariseSlots,
  type YardBatch,
} from "@/lib/yard";

export default async function YardPage(props: PageProps<"/yard">) {
  const raw = await props.searchParams;
  const parsed = parseYardQuery(raw);
  const supabase = await createClient();
  /* The edit lists are small and readable by every member, so they ride the same round trip
     as the batches instead of waiting on the role check. */
  const [{ data }, session, { data: productRows }, { data: supplierRows }] = await Promise.all([
    supabase.from("v_yard_batches").select("*"),
    getSession(),
    supabase.from("products").select("id, name, category").order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);
  const all: YardBatch[] = data ?? [];
  /* A deep link to a Stock Line (palette, stale panel) lands on that line's own slot. */
  const lineSlot = parsed.line && !raw.slot ? all.find((b) => b.line_key === parsed.line)?.slot : undefined;
  const query = isSlot(lineSlot) ? { ...parsed, slot: lineSlot } : parsed;
  const isAdmin = session.status === "member" && session.member.role === "ADMIN";
  const editLists: EditLists | null = isAdmin
    ? { products: productRows ?? [], suppliers: supplierRows ?? [] }
    : null;

  const filtered = all.filter((b) => matchesFilters(b, query));
  const summaries = summariseSlots(filtered);
  const inSlot = filtered.filter((b) => b.slot === query.slot);
  const sizes = sizesIn(inSlot);
  const activeSize = query.size && sizes.includes(query.size) ? query.size : (sizes[0] ?? null);
  const visible = sortBatches(
    activeSize ? inSlot.filter((b) => sizeKey(b) === activeSize) : inSlot,
    query.sort,
  );

  const products = uniq(all.map((b) => [b.product_id ?? "", b.product_name ?? ""]));
  const variants = uniq(
    all.filter((b) => !query.product || b.product_id === query.product).map((b) => [b.variant_id ?? "", b.variant_name ?? ""]),
  );
  const suppliers = uniq(all.map((b) => [b.supplier_id ?? "", b.supplier_name ?? ""]));
  const thicknesses = [...new Set(all.map((b) => b.thickness_mm).filter((t): t is number => t !== null))].sort((a, b) => a - b);

  const href = (slot: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      const s = Array.isArray(v) ? v[0] : v;
      if (s && k !== "size") sp.set(k, s);
    }
    sp.set("slot", slot);
    return `/yard?${sp.toString()}`;
  };
  const sizeHref = (size: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      const s = Array.isArray(v) ? v[0] : v;
      if (s) sp.set(k, s);
    }
    sp.set("slot", query.slot);
    sp.set("size", size);
    return `/yard?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader title="Yard Slots" />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Slots">
        {SLOTS.map((slot) => {
          const active = slot === query.slot;
          const summary = summaries.find((s) => s.slot === slot);
          return (
            <Link
              key={slot}
              href={href(slot)}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium",
                active ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {SLOT_LABEL[slot]}
              <span className={cn("text-xs tabular", active ? "text-accent-foreground/80" : "text-muted-foreground")}>
                {summary?.available ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <YardFilters query={query} products={products} variants={variants} thicknesses={thicknesses} suppliers={suppliers} />

      <section className="rounded-card bg-card/60 p-4 shadow-sm ring-1 ring-border md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">{SLOT_LABEL[query.slot]}</h2>
          <span className="text-sm text-muted-foreground tabular">
            {inSlot.length} {inSlot.length === 1 ? "batch" : "batches"} · {inSlot.reduce((n, b) => n + (b.available ?? 0), 0)} available
          </span>
        </div>

        {sizes.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Size:</span>
            {sizes.map((size) => (
              <Link
                key={size}
                href={sizeHref(size)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
                  size === activeSize ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card hover:bg-secondary",
                )}
              >
                {size}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {all.length === 0 ? "No batches in the yard yet. Log a delivery to get started." : "Nothing matches these filters."}
            </p>
          ) : (
            visible.map((batch, i) => {
              const prev = visible[i - 1];
              const sameLine = prev && prev.line_key === batch.line_key;
              const later = query.sort === "oldest" ? batch : prev;
              const gap = sameLine ? (later?.days_since_previous ?? null) : null;
              return (
                <div key={batch.id ?? batch.batch_code} className="flex flex-col gap-3">
                  {gap !== null ? <Clamp days={gap} /> : null}
                  <BatchCard batch={batch} actions={editLists ? <BatchActions batch={batch} lists={editLists} /> : undefined} />
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {summaries
          .filter((s) => s.slot !== query.slot)
          .map((s) => (
            <Link
              key={s.slot}
              href={href(s.slot)}
              className="flex items-center justify-between rounded-card bg-card px-5 py-4 shadow-sm ring-1 ring-border hover:bg-secondary/50"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-sm font-bold">{SLOT_LABEL[s.slot]}</span>
                <span className="text-sm text-muted-foreground tabular">
                  {s.batches} {s.batches === 1 ? "batch" : "batches"} · {s.available} available
                </span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Link>
          ))}
      </div>
    </>
  );
}

function uniq(pairs: readonly (readonly [string, string])[]): { value: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [v, l] of pairs) if (v && !m.has(v)) m.set(v, l);
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
