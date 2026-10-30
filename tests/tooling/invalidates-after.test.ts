import { describe, expect, it } from "vitest";
import {
  customerListQuery,
  customersQuery,
  dashboardKpisQuery,
  fastMovingQuery,
  marginByPeriodQuery,
  productsQuery,
  recentBatchesQuery,
  recentStacksQuery,
  staleAfterDaysQuery,
  stockLinesQuery,
  suppliersQuery,
  topCustomersQuery,
  yardBatchesQuery,
} from "@/lib/query/reads";
import { invalidatesAfter, type Write } from "@/lib/query/writes";

const SALE_READS = [
  "customer-list",
  "dashboard-kpis",
  "fast-moving",
  "margin-by-period",
  "recent-batches",
  "stock-lines",
  "top-customers",
  "yard-batches",
];
const BATCH_READS = ["dashboard-kpis", "recent-batches", "recent-stacks", "stock-lines", "yard-batches"];
const RENAMED_PRODUCT_READS = [
  "fast-moving",
  "products",
  "recent-batches",
  "stock-lines",
  "top-customers",
  "yard-batches",
];
const RENAMED_SUPPLIER_READS = ["recent-batches", "stock-lines", "suppliers", "yard-batches"];

type Case = readonly [write: Write, keys: readonly string[], serverRefresh: boolean];

const CASES: readonly Case[] = [
  ["record-sale", SALE_READS, false],
  ["correct-sale", SALE_READS, true],
  ["delete-sale", SALE_READS, true],
  ["inward-batch", BATCH_READS, false],
  ["correct-batch", [...BATCH_READS, "fast-moving", "top-customers"], false],
  ["archive-batch", ["dashboard-kpis", "recent-batches", "stock-lines", "yard-batches"], false],
  ["delete-batch", BATCH_READS, false],
  ["add-customer", ["customer-list", "customers"], false],
  ["edit-customer", ["customer-list", "customers", "top-customers"], true],
  ["delete-customer", ["customer-list", "customers"], false],
  ["create-product", ["products"], false],
  ["create-supplier", ["suppliers"], false],
  ["rename-product", RENAMED_PRODUCT_READS, false],
  ["rename-supplier", RENAMED_SUPPLIER_READS, false],
  ["archive-product", ["products"], false],
  ["archive-supplier", ["suppliers"], false],
  ["delete-product", ["products"], false],
  ["delete-supplier", ["suppliers"], false],
  ["settings-rename-product", RENAMED_PRODUCT_READS, true],
  ["settings-rename-supplier", RENAMED_SUPPLIER_READS, true],
  ["settings-archive-product", ["products"], true],
  ["settings-archive-supplier", ["suppliers"], true],
  ["settings-delete-product", ["products"], true],
  ["settings-delete-supplier", ["suppliers"], true],
  ["inventory-rules", ["stale-after-days", "yard-batches"], true],
  ["team-access", [], true],
  ["public-link", [], true],
];

const READ_ROOTS = [
  yardBatchesQuery,
  stockLinesQuery,
  customersQuery,
  recentStacksQuery,
  productsQuery,
  suppliersQuery,
  customerListQuery,
  recentBatchesQuery(false),
  recentBatchesQuery(true),
  dashboardKpisQuery,
  fastMovingQuery,
  marginByPeriodQuery("week"),
  marginByPeriodQuery("month"),
  topCustomersQuery("month"),
  topCustomersQuery("90d"),
  topCustomersQuery("all"),
  staleAfterDaysQuery,
].map((query) => query.queryKey[0]);

describe("invalidatesAfter", () => {
  it.each(CASES)("%s", (write, keys, serverRefresh) => {
    const result = invalidatesAfter(write);
    expect([...result.keys].sort()).toEqual([...keys].sort());
    expect(result.serverRefresh).toBe(serverRefresh);
  });

  it("names only query roots that reads.ts defines", () => {
    const known = new Set(READ_ROOTS);
    for (const [write] of CASES) {
      for (const key of invalidatesAfter(write).keys) expect(known.has(key)).toBe(true);
    }
  });

  it("refreshes the server only for writes made on a server-rendered page", () => {
    const refreshing = CASES.filter(([write]) => invalidatesAfter(write).serverRefresh).map(([write]) => write);
    expect(refreshing.sort()).toEqual([
      "correct-sale",
      "delete-sale",
      "edit-customer",
      "inventory-rules",
      "public-link",
      "settings-archive-product",
      "settings-archive-supplier",
      "settings-delete-product",
      "settings-delete-supplier",
      "settings-rename-product",
      "settings-rename-supplier",
      "team-access",
    ]);
  });
});
