import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, recordSale } from "./fixtures";

function istToday(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${s}T00:00:00Z`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("dashboard: v_dashboard_kpis and fast_moving", () => {
  let operator: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
  });

  it("computes the KPIs from a hand-checked dataset across a month boundary", async () => {
    const today = istToday();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const lastMonthEnd = new Date(monthStart.getTime() - 86_400_000);
    const lastMonthMid = new Date(lastMonthEnd.getTime() - 10 * 86_400_000);

    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const customerId = await createCustomer(operator, { name: "Murugan" });

    // Batch A: 20 pieces at landed 1000, bought last month. Batch B: 10 at 2000, bought this month.
    const a = await createBatch(operator, { productId, supplierId, units: 20, unitPrice: 1000, purchaseDate: iso(lastMonthMid) });
    const b = await createBatch(operator, { productId, supplierId, units: 10, unitPrice: 2000, purchaseDate: iso(monthStart), length: 5, breadth: 3, thickness: 20 });

    // Sold 5 of A last month (not MTD), 3 of A this month with stickering, 2 of B this month.
    await recordSale(operator, { batchId: a.data?.id ?? "", customerId, quantity: 5, salePrice: 1500, saleDate: iso(lastMonthEnd) });
    await recordSale(operator, { batchId: a.data?.id ?? "", customerId, quantity: 3, salePrice: 1500, saleDate: iso(monthStart), stickering: { cost: 100, price: 300 } });
    await recordSale(operator, { batchId: b.data?.id ?? "", customerId, quantity: 2, salePrice: 2500, saleDate: iso(today), misc: 500 });

    const { data: k } = await operator.from("v_dashboard_kpis").select("*").single();
    expect(k?.active_stock).toBe(20);
    expect(k?.inventory_value).toBe(12 * 1000 + 8 * 2000);
    expect(k?.units_sold_total).toBe(10);
    expect(k?.active_stock_last_month_end).toBe(15);
    expect(k?.mtd_revenue).toBe(3 * 1800 + 2 * 2500);
    expect(k?.mtd_margin).toBe(3 * 500 + 3 * 200 + 2 * 500);
    expect(k?.mtd_margin_pct).toBe(29.81);
    expect(k?.mtd_sales).toBe(2);
    expect(k?.month_start).toBe(iso(monthStart));

    const { data: fast } = await operator.rpc("fast_moving", { p_days: 90, p_limit: 5 });
    expect(fast).toEqual([
      { label: "4 × 2 ft", units: 8 },
      { label: "5 × 3 ft", units: 2 },
    ]);

    const { data: none } = await operator.rpc("fast_moving", { p_days: 0, p_limit: 5 });
    expect(none).toEqual([]);
  });

  it("memorial sales are grouped by variant and an empty yard reads as zeros", async () => {
    const { data: empty } = await operator.from("v_dashboard_kpis").select("active_stock, inventory_value, mtd_revenue, mtd_margin_pct").single();
    expect(empty).toEqual({ active_stock: 0, inventory_value: 0, mtd_revenue: 0, mtd_margin_pct: null });

    const doom = await createProduct(operator, { name: "Doom Stone", abbreviation: "DS", category: "MEMORIAL" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const customerId = await createCustomer(operator, { name: "Temple" });
    const batch = await createBatch(operator, { productId: doom, supplierId, variantName: "Std Cross", length: null, units: 9 });
    await recordSale(operator, { batchId: batch.data?.id ?? "", customerId, quantity: 4 });
    const { data: fast } = await operator.rpc("fast_moving", {});
    expect(fast).toEqual([{ label: "Std Cross", units: 4 }]);
  });
});
