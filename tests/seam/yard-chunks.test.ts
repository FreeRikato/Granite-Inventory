import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  chunkStacks,
  groupBySize,
  groupByStack,
  matchesFilters,
  parseYardQuery,
  type YardBatch,
} from "@/lib/yard";

function batch(n: number): YardBatch {
  const day = String(n).padStart(2, "0");
  return {
    age_days: 10,
    ageing_band: "FRESH",
    archived_at: null,
    available: 2,
    batch_code: `B-${n}`,
    breadth_ft: 2,
    category: "GRANITE",
    created_at: `2026-01-${day}T00:00:00Z`,
    created_by: null,
    days_since_previous: n === 1 ? null : 5,
    freight_cost: 0,
    id: `id-${n}`,
    initial_units: 2,
    landed_cost: 0,
    length_ft: 4,
    line_key: "line-a",
    notes: null,
    previous_purchase_date: null,
    product_abbreviation: "BP",
    product_id: "product-a",
    product_name: "Black Pearl",
    purchase_date: `2026-01-${day}`,
    slot: "4FT",
    sold_out: false,
    stack_number: "1",
    supplier_id: "supplier-a",
    supplier_name: "Quarry",
    thickness_mm: 16,
    unit_purchase_price: 100,
    units_sold: 0,
    updated_at: null,
    updated_by: null,
    variant_id: "variant-a",
    variant_name: "Grade 1",
  };
}

function stackOf(count: number) {
  return groupByStack(Array.from({ length: count }, (_, i) => batch(i + 1)));
}

describe("chunkStacks", () => {
  it("splits a large stack and marks only the first chunk leading and only the last trailing", () => {
    const chunks = chunkStacks(stackOf(5), "oldest", 2);
    expect(chunks.map((c) => c.entries.length)).toEqual([2, 2, 1]);
    expect(chunks.map((c) => c.leading)).toEqual([true, false, false]);
    expect(chunks.map((c) => c.trailing)).toEqual([false, false, true]);
  });

  it("marks a single chunk as both leading and trailing", () => {
    const [chunk] = chunkStacks(stackOf(2), "oldest");
    expect(chunk?.leading).toBe(true);
    expect(chunk?.trailing).toBe(true);
  });

  it("carries the clamp gap across a chunk boundary", () => {
    const chunks = chunkStacks(stackOf(3), "oldest", 2);
    expect(chunks[1]?.entries[0]?.gap).toBe(5);
    expect(chunks[0]?.entries[0]?.gap).toBeNull();
  });

  it("keeps a stack of up to CHUNK_SIZE batches as one chunk and splits one more", () => {
    expect(chunkStacks(stackOf(CHUNK_SIZE), "oldest")).toHaveLength(1);
    expect(chunkStacks(stackOf(CHUNK_SIZE + 1), "oldest")).toHaveLength(2);
  });

  it("keeps a stack of any size as one chunk when the size is unbounded", () => {
    expect(chunkStacks(stackOf(CHUNK_SIZE * 5), "oldest", Infinity)).toHaveLength(1);
  });
});

describe("groupBySize", () => {
  const sized = (n: number, length_ft: number | null, breadth_ft: number | null, extra: Partial<YardBatch> = {}) => ({
    ...batch(n),
    length_ft,
    breadth_ft,
    ...extra,
  });

  it("gives every Size a heading, smallest first, with No size last", () => {
    const sections = groupBySize([
      sized(1, null, null),
      sized(2, 10, 2),
      sized(3, 5, 3),
      sized(4, 4, 2.5),
      sized(5, 4, 2),
    ]);
    expect(sections.map((s) => s.title)).toEqual(["4 × 2 ft", "4 × 2.5 ft", "5 × 3 ft", "10 × 2 ft", "No size"]);
  });

  it("puts Batches of one length and breadth together across Products, Slots and thicknesses", () => {
    const sections = groupBySize([
      sized(1, 4, 2, { product_id: "product-a", slot: "4FT", thickness_mm: 16, line_key: "a16" }),
      sized(2, 4, 2, { product_id: "product-b", slot: "CUSTOM", thickness_mm: 20, line_key: "b20" }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.batches.map((b) => b.batch_code)).toEqual(["B-1", "B-2"]);
  });

  it("leaves Archived Batches out of a heading's available count", () => {
    const [section] = groupBySize([
      sized(1, 4, 2, { available: 3 }),
      sized(2, 4, 2, { available: 4, archived_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(section?.batches).toHaveLength(2);
    expect(section?.available).toBe(3);
  });

  it("keeps a Stock Line together and clamps only inside it when a heading mixes Products", () => {
    const list = [
      sized(1, 4, 2, { line_key: "a", days_since_previous: null }),
      sized(2, 4, 2, { line_key: "b", days_since_previous: null }),
      sized(3, 4, 2, { line_key: "a", days_since_previous: 2 }),
      sized(4, 4, 2, { line_key: "b", days_since_previous: 2 }),
    ];
    const chunks = chunkStacks(groupBySize(list), "oldest", 3);
    const entries = chunks.flatMap((c) => c.entries);
    expect(entries.map((e) => e.batch.batch_code)).toEqual(["B-1", "B-3", "B-2", "B-4"]);
    expect(entries.map((e) => e.gap)).toEqual([null, 2, null, 2]);
    expect(chunks.map((c) => [c.leading, c.trailing])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("keeps Stock Lines apart when their first Batches tie on date, in either sort", () => {
    const tied = (n: number, line: string, day: string, gap: number | null) =>
      sized(n, 4, 2, {
        line_key: line,
        purchase_date: `2026-01-${day}`,
        created_at: `2026-01-${day}T00:00:00Z`,
        days_since_previous: gap,
      });
    const list = [tied(1, "a", "01", null), tied(2, "b", "01", null), tied(3, "a", "05", 4), tied(4, "b", "05", 4)];
    const lines = (sort: "oldest" | "newest") =>
      chunkStacks(groupBySize(list), sort, Infinity).flatMap((c) => c.entries.map((e) => [e.batch.batch_code, e.gap]));
    expect(lines("oldest")).toEqual([
      ["B-1", null],
      ["B-3", 4],
      ["B-2", null],
      ["B-4", 4],
    ]);
    expect(lines("newest")).toEqual([
      ["B-3", null],
      ["B-1", 4],
      ["B-4", null],
      ["B-2", 4],
    ]);
  });

  it("gives its chunks keys that no Stack can share, so measured heights never carry over", () => {
    const size = chunkStacks(groupBySize([sized(1, 4, 2), sized(2, null, null)]), "oldest");
    const stack = chunkStacks(
      groupByStack([
        { ...batch(1), slot: "4", stack_number: "2" },
        { ...batch(2), stack_number: null },
      ]),
      "oldest",
    );
    const stackKeys = new Set(stack.map((c) => c.key));
    expect(size.filter((c) => stackKeys.has(c.key))).toEqual([]);
  });
});

describe("parseYardQuery group", () => {
  it("defaults to Slot, so existing links keep working", () => {
    expect(parseYardQuery({}).group).toBe("slot");
    expect(parseYardQuery({ group: "anything" }).group).toBe("slot");
  });

  it("reads Group by Size from the URL", () => {
    expect(parseYardQuery({ group: "size" }).group).toBe("size");
  });
});

describe("groupByStack title", () => {
  it("names a Stack and the section of Batches with no number", () => {
    const sections = groupByStack([batch(1), { ...batch(2), stack_number: null }]);
    expect(sections.map((s) => s.title)).toEqual(["4 ft Slot · 1", "No batch number"]);
  });
});

describe("matchesFilters low", () => {
  const withAvailable = (available: number) => ({ ...batch(1), available, sold_out: available === 0 });

  it("keeps Batches with fewer than 5 left and drops those with 5 or more", () => {
    const low = parseYardQuery({ low: "1" });
    expect(matchesFilters(withAvailable(4), low)).toBe(true);
    expect(matchesFilters(withAvailable(1), low)).toBe(true);
    expect(matchesFilters(withAvailable(5), low)).toBe(false);
  });

  it("shows a Sold Out Batch only when Show sold out is on", () => {
    expect(matchesFilters(withAvailable(0), parseYardQuery({ low: "1" }))).toBe(false);
    expect(matchesFilters(withAvailable(0), parseYardQuery({ low: "1", sold: "1" }))).toBe(true);
  });

  it("leaves Batches with 5 or more in place when the filter is off", () => {
    expect(matchesFilters(withAvailable(5), parseYardQuery({}))).toBe(true);
  });
});
