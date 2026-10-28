import { describe, expect, it } from "vitest";
import { allRows, readProducts, readSuppliers, type Db } from "@/lib/query/reads";

type Row = { id: string };

function table(rows: readonly Row[]) {
  const calls: [number, number][] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "order", "gt", "not"]) chain[method] = () => chain;
  chain.range = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  const db = { from: () => chain } as unknown as Db;
  return { db, calls };
}

function ids(count: number, offset = 0): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: String(i + offset) }));
}

describe("allRows", () => {
  it("drops a row the second page repeats after a write shifted the offsets", async () => {
    const pages = [ids(1000), [{ id: "999" }, ...ids(5, 1000)]];
    const read = await allRows<Row>(
      (from) => Promise.resolve({ data: pages[from / 1000] ?? [], error: null }),
      (r) => r.id,
    );
    expect(read).toHaveLength(1005);
    expect(new Set(read.map((r) => r.id)).size).toBe(1005);
    expect(read.map((r) => r.id).slice(998, 1002)).toEqual(["998", "999", "1000", "1001"]);
  });

  it("keeps paging when a repeated row makes the last page look short", async () => {
    const pages = [ids(1000), ids(1000, 1000), ids(3, 2000)];
    const read = await allRows<Row>(
      (from) => Promise.resolve({ data: pages[from / 1000] ?? [], error: null }),
      (r) => r.id,
    );
    expect(read).toHaveLength(2003);
  });
});

describe("products and suppliers reads", () => {
  it("read every product past the 1,000 row cap", async () => {
    const { db, calls } = table(ids(1200));
    expect(await readProducts(db)).toHaveLength(1200);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("read every supplier past the 1,000 row cap", async () => {
    const { db, calls } = table(ids(1200));
    expect(await readSuppliers(db)).toHaveLength(1200);
    expect(calls).toHaveLength(2);
  });
});
