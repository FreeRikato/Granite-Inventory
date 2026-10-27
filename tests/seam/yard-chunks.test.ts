import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, chunkStacks, groupByStack, type YardBatch } from "@/lib/yard";

function batch(n: number): YardBatch {
  const day = String(n).padStart(2, "0");
  return {
    age_days: 10,
    ageing_band: "FRESH",
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
