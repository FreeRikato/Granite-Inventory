import type { Tables } from "@/lib/database.types";
import { formatDims } from "@/lib/format";
import { SLOTS, isAgeFilter, isSlot, type AgeFilter, type Slot } from "@/lib/domain";

export type YardBatch = Tables<"v_yard_batches">;

export type YardQuery = {
  readonly slot: Slot;
  readonly size: string | null;
  readonly q: string;
  readonly product: string | null;
  readonly variant: string | null;
  readonly thickness: number | null;
  readonly supplier: string | null;
  readonly age: AgeFilter | null;
  readonly band: "STALE" | null;
  readonly line: string | null;
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
  const ageNumber = age && /^\d+$/.test(age) ? Number(age) : null;
  const thickness = one(raw, "thickness");
  return {
    slot: isSlot(slot) ? slot : "4FT",
    size: one(raw, "size"),
    q: one(raw, "q") ?? "",
    product: one(raw, "product"),
    variant: one(raw, "variant"),
    thickness: thickness ? Number.parseInt(thickness, 10) : null,
    supplier: one(raw, "supplier"),
    age: ageNumber !== null && isAgeFilter(ageNumber) ? ageNumber : null,
    band: age === "stale" ? "STALE" : null,
    line: one(raw, "line"),
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
  if (q.line && b.line_key !== q.line) return false;
  if (q.q) {
    const hay = `${b.product_name} ${b.variant_name} ${b.supplier_name} ${b.batch_code}`.toLowerCase();
    if (!hay.includes(q.q.toLowerCase())) return false;
  }
  return true;
}

/* Batches of one Stock Line stay together (so the Clamp sits between deliveries of the same
   stone), lines ordered by their oldest batch, batches within a line by date. */
export function sortBatches(list: readonly YardBatch[], sort: YardQuery["sort"]): YardBatch[] {
  const dir = sort === "oldest" ? 1 : -1;
  const byDate = (a: YardBatch, b: YardBatch) => {
    const d = (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "");
    return d !== 0 ? d : (a.created_at ?? "").localeCompare(b.created_at ?? "");
  };
  const lineStart = new Map<string, YardBatch>();
  for (const b of [...list].sort(byDate)) {
    if (!lineStart.has(b.line_key ?? "")) lineStart.set(b.line_key ?? "", b);
  }
  return [...list].sort((a, b) => {
    if (a.line_key !== b.line_key) {
      return byDate(lineStart.get(a.line_key ?? "") ?? a, lineStart.get(b.line_key ?? "") ?? b) * dir;
    }
    return byDate(a, b) * dir;
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

