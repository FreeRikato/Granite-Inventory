import type { Tables } from "@/lib/database.types";
import { formatDims } from "@/lib/format";
import { SLOTS, isSlot, type Slot } from "@/lib/domain";

export type YardBatch = Tables<"v_yard_batches">;

export type YardQuery = {
  readonly slot: Slot;
  readonly size: string | null;
  readonly q: string;
  readonly product: string | null;
  readonly variant: string | null;
  readonly thickness: number | null;
  readonly supplier: string | null;
  readonly age: 90 | 180 | 365 | null;
  readonly band: "STALE" | null;
  readonly sort: "oldest" | "newest";
  readonly sold: boolean;
};

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string): string | null {
  const v = raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : null;
}

export function parseYardQuery(raw: Raw): YardQuery {
  const slot = one(raw, "slot");
  const age = one(raw, "age");
  const thickness = one(raw, "thickness");
  return {
    slot: isSlot(slot) ? slot : "4FT",
    size: one(raw, "size"),
    q: one(raw, "q") ?? "",
    product: one(raw, "product"),
    variant: one(raw, "variant"),
    thickness: thickness ? Number.parseInt(thickness, 10) : null,
    supplier: one(raw, "supplier"),
    age: age === "90" || age === "180" || age === "365" ? Number(age) as 90 | 180 | 365 : null,
    band: one(raw, "band") === "STALE" ? "STALE" : null,
    sort: one(raw, "sort") === "newest" ? "newest" : "oldest",
    sold: one(raw, "sold") === "1",
  };
}

export function sizeKey(b: Pick<YardBatch, "length_ft" | "breadth_ft">): string {
  return formatDims(b.length_ft, b.breadth_ft);
}

/* Applies every filter except slot and size, which drive the tabs. */
export function matchesFilters(b: YardBatch, q: YardQuery): boolean {
  if (!q.sold && b.sold_out) return false;
  if (q.product && b.product_id !== q.product) return false;
  if (q.variant && b.variant_id !== q.variant) return false;
  if (q.thickness !== null && b.thickness_mm !== q.thickness) return false;
  if (q.supplier && b.supplier_id !== q.supplier) return false;
  if (q.age !== null && (b.age_days ?? 0) <= q.age) return false;
  if (q.band && b.ageing_band !== q.band) return false;
  if (q.q) {
    const hay = `${b.product_name} ${b.variant_name} ${b.supplier_name} ${b.batch_code}`.toLowerCase();
    if (!hay.includes(q.q.toLowerCase())) return false;
  }
  return true;
}

export function sortBatches(list: readonly YardBatch[], sort: YardQuery["sort"]): YardBatch[] {
  const dir = sort === "oldest" ? 1 : -1;
  return [...list].sort((a, b) => {
    const byDate = (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "") * dir;
    return byDate !== 0 ? byDate : (a.created_at ?? "").localeCompare(b.created_at ?? "") * dir;
  });
}

export type SlotSummary = { readonly slot: Slot; readonly batches: number; readonly available: number };

export function summariseSlots(list: readonly YardBatch[]): SlotSummary[] {
  return SLOTS.map((slot) => {
    const rows = list.filter((b) => b.slot === slot);
    return { slot, batches: rows.length, available: rows.reduce((n, b) => n + (b.available ?? 0), 0) };
  });
}

export function sizesIn(list: readonly YardBatch[]): string[] {
  const seen = new Map<string, number>();
  for (const b of list) {
    const key = sizeKey(b);
    seen.set(key, (b.length_ft ?? 0) * 100 + (b.breadth_ft ?? 0));
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/* Consecutive batches in the same stock line get a Clamp between them. Recomputed on the
   visible, sorted list so the label is right whatever the filters. */
export function stockLineKey(b: YardBatch): string {
  return `${b.variant_id}|${b.length_ft}|${b.breadth_ft}|${b.thickness_mm}`;
}
