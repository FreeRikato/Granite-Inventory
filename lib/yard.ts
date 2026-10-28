import type { Tables } from "@/lib/database.types";
import { isAgeFilter, slotChoices, type AgeFilter } from "@/lib/domain";

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
};

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
  };
}

export function matchesFilters(b: YardBatch, q: YardQuery): boolean {
  if (!q.archived && b.archived_at) return false;
  if (!q.sold && b.sold_out) return false;
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
      return byDate(lineStart.get(a.line_key ?? "") ?? a, lineStart.get(b.line_key ?? "") ?? b) * dir;
    }
    return byDate(a, b) * dir;
  });
}

export type StackGroup = {
  readonly key: string;
  readonly slot: string | null;
  readonly stackNumber: string | null;
  readonly batches: readonly YardBatch[];
  readonly available: number;
};

export function groupByStack(list: readonly YardBatch[]): StackGroup[] {
  const groups = new Map<string, YardBatch[]>();
  for (const b of list) {
    const key = b.stack_number ? `${b.slot}|${b.stack_number}` : "none";
    const group = groups.get(key);
    if (group) group.push(b);
    else groups.set(key, [b]);
  }
  const order = slotChoices(list.map((b) => b.slot));
  const rank = (slot: string | null) => (slot ? order.indexOf(slot) : order.length);
  return [...groups.entries()]
    .map(([key, batches]) => {
      const first = batches[0];
      const slot = key !== "none" ? (first?.slot ?? null) : null;
      return {
        key,
        slot,
        stackNumber: key === "none" ? null : (first?.stack_number ?? null),
        batches,
        available: batches.reduce((n, b) => n + (b.archived_at ? 0 : (b.available ?? 0)), 0),
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

export type YardEntry = {
  readonly batch: YardBatch;
  readonly gap: number | null;
};

export type StackChunk = {
  readonly key: string;
  readonly group: StackGroup;
  readonly leading: boolean;
  readonly trailing: boolean;
  readonly entries: readonly YardEntry[];
};

export const CHUNK_SIZE = 6;

export const WINDOW_AFTER = 100;

export function chunkStacks(groups: readonly StackGroup[], sort: YardQuery["sort"], size = CHUNK_SIZE): StackChunk[] {
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
