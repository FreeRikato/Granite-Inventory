import type { Tables } from "@/lib/database.types";
import { isAgeFilter, slotChoices, stackLabel, type AgeFilter } from "@/lib/domain";
import { formatDims } from "@/lib/format";

export type YardBatch = Tables<"v_yard_batches">;

export type YardQuery = {
  readonly slot: string | null;
  readonly q: string;
  readonly product: string | null;
  readonly thickness: number | null;
  readonly supplier: string | null;
  readonly age: AgeFilter | null;
  readonly band: "STALE" | null;
  readonly line: string | null;
  readonly sort: "oldest" | "newest";
  readonly sold: boolean;
  readonly archived: boolean;
  readonly low: boolean;
  readonly group: "slot" | "size";
};

export const LOW_STOCK_BELOW = 5;

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string): string | null {
  const v = raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : null;
}

export function parseYardQuery(raw: Raw): YardQuery {
  const age = one(raw, "age");
  const ageNumber = age && /^\d+$/.test(age) ? Number(age) : null;
  const thickness = one(raw, "thickness");
  return {
    slot: one(raw, "slot"),
    q: one(raw, "q") ?? "",
    product: one(raw, "product"),
    thickness: thickness ? Number.parseInt(thickness, 10) : null,
    supplier: one(raw, "supplier"),
    age: ageNumber !== null && isAgeFilter(ageNumber) ? ageNumber : null,
    band: age === "stale" ? "STALE" : null,
    line: one(raw, "line"),
    sort: one(raw, "sort") === "newest" ? "newest" : "oldest",
    sold: one(raw, "sold") === "1",
    archived: one(raw, "archived") === "1",
    low: one(raw, "low") === "1",
    group: one(raw, "group") === "size" ? "size" : "slot",
  };
}

export function matchesFilters(b: YardBatch, q: YardQuery): boolean {
  if (!q.archived && b.archived_at) return false;
  if (!q.sold && b.sold_out) return false;
  if (q.low && (b.available ?? 0) >= LOW_STOCK_BELOW) return false;
  if (q.slot && b.slot !== q.slot) return false;
  if (q.product && b.product_id !== q.product) return false;
  if (q.thickness !== null && b.thickness_mm !== q.thickness) return false;
  if (q.supplier && b.supplier_id !== q.supplier) return false;
  if (q.age !== null && (b.age_days ?? 0) <= q.age) return false;
  if (q.band && b.ageing_band !== q.band) return false;
  if (q.line && b.line_key !== q.line) return false;
  if (q.q) {
    const hay = `${b.product_name} ${b.supplier_name} ${b.batch_code} ${b.stack_number ?? ""}`.toLowerCase();
    if (!hay.includes(q.q.toLowerCase())) return false;
  }
  return true;
}

export function sortBatches(list: readonly YardBatch[], sort: YardQuery["sort"]): YardBatch[] {
  const dir = sort === "oldest" ? 1 : -1;
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byDate = (a: YardBatch, b: YardBatch) =>
    compare(a.purchase_date ?? "", b.purchase_date ?? "") || compare(a.created_at ?? "", b.created_at ?? "");
  const lineStart = new Map<string, YardBatch>();
  for (const b of [...list].sort(byDate)) {
    if (!lineStart.has(b.line_key ?? "")) lineStart.set(b.line_key ?? "", b);
  }
  return [...list].sort((a, b) => {
    if (a.line_key !== b.line_key) {
      return (
        byDate(lineStart.get(a.line_key ?? "") ?? a, lineStart.get(b.line_key ?? "") ?? b) * dir ||
        compare(a.line_key ?? "", b.line_key ?? "")
      );
    }
    return byDate(a, b) * dir;
  });
}

export type YardSection = {
  readonly key: string;
  readonly title: string;
  readonly showStack: boolean;
  readonly batches: readonly YardBatch[];
  readonly available: number;
};

export type StackGroup = YardSection & {
  readonly slot: string | null;
  readonly stackNumber: string | null;
};

function bucket(list: readonly YardBatch[], keyOf: (b: YardBatch) => string): Map<string, YardBatch[]> {
  const groups = new Map<string, YardBatch[]>();
  for (const b of list) {
    const key = keyOf(b);
    const group = groups.get(key);
    if (group) group.push(b);
    else groups.set(key, [b]);
  }
  return groups;
}

function availableIn(batches: readonly YardBatch[]): number {
  return batches.reduce((n, b) => n + (b.archived_at ? 0 : (b.available ?? 0)), 0);
}

export function groupByStack(list: readonly YardBatch[]): StackGroup[] {
  const groups = bucket(list, (b) => (b.stack_number ? `${b.slot}|${b.stack_number}` : "none"));
  const order = slotChoices(list.map((b) => b.slot));
  const rank = (slot: string | null) => (slot ? order.indexOf(slot) : order.length);
  return [...groups.entries()]
    .map(([key, batches]) => {
      const first = batches[0];
      const slot = key !== "none" ? (first?.slot ?? null) : null;
      const stackNumber = key === "none" ? null : (first?.stack_number ?? null);
      return {
        key,
        title: slot && stackNumber ? stackLabel(slot, stackNumber) : "No batch number",
        showStack: false,
        slot,
        stackNumber,
        batches,
        available: availableIn(batches),
      };
    })
    .sort((a, b) => {
      if (a.key === "none" || b.key === "none") return a.key === "none" ? 1 : -1;
      return (
        rank(a.slot) - rank(b.slot) ||
        (a.stackNumber ?? "").localeCompare(b.stackNumber ?? "", undefined, { numeric: true })
      );
    });
}

const NO_SIZE = "size|none";

export function groupBySize(list: readonly YardBatch[]): YardSection[] {
  const lastIfNone = (ft: number | null) => ft ?? Number.MAX_VALUE;
  const smallestFirst = [...list].sort(
    (a, b) => lastIfNone(a.length_ft) - lastIfNone(b.length_ft) || lastIfNone(a.breadth_ft) - lastIfNone(b.breadth_ft),
  );
  const groups = bucket(smallestFirst, (b) =>
    b.length_ft === null || b.breadth_ft === null ? NO_SIZE : `size|${b.length_ft}|${b.breadth_ft}`,
  );
  return [...groups.entries()].map(([key, batches]) => ({
    key,
    title: key === NO_SIZE ? "No size" : formatDims(batches[0]?.length_ft ?? null, batches[0]?.breadth_ft ?? null),
    showStack: true,
    batches,
    available: availableIn(batches),
  }));
}

export type YardEntry = {
  readonly batch: YardBatch;
  readonly gap: number | null;
};

export type StackChunk = {
  readonly key: string;
  readonly group: YardSection;
  readonly leading: boolean;
  readonly trailing: boolean;
  readonly entries: readonly YardEntry[];
};

export const CHUNK_SIZE = 6;

export const WINDOW_AFTER = 100;

export function chunkStacks(groups: readonly YardSection[], sort: YardQuery["sort"], size = CHUNK_SIZE): StackChunk[] {
  return groups.flatMap((group) => {
    const sorted = sortBatches(group.batches, sort);
    const entries = sorted.map((batch, i) => {
      const prev = sorted[i - 1];
      const sameLine = prev && prev.line_key === batch.line_key;
      const later = sort === "oldest" ? batch : prev;
      return { batch, gap: sameLine ? (later?.days_since_previous ?? null) : null };
    });
    const chunks: StackChunk[] = [];
    for (let start = 0; start < entries.length; start += size) {
      chunks.push({
        key: `${group.key}#${start}`,
        group,
        leading: start === 0,
        trailing: start + size >= entries.length,
        entries: entries.slice(start, start + size),
      });
    }
    return chunks;
  });
}
