import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, today } from "./fixtures";

const DAY_MS = 86_400_000;

function istToday(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${s}T00:00:00Z`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mondayOf(d: Date): Date {
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY_MS);
}
function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function monthsBack(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}

type SaleRow = {
  quantity: number;
  salePrice: number;
  saleDate?: string;
  stickering?: { cost: number; price: number };
  misc?: number;
};

const LANDED_COST = 1000;

describe("dashboard trends: margin_by_period", () => {
  let operator: Db;
  let admin: Db;
  let batchId: string;
  let customerId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
  });

  async function insertSale(row: SaleRow) {
    await sql(
      `insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, has_stickering, stickering_cost, stickering_price, misc_expense, payment_mode)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CASH')`,
      [
        row.saleDate ?? today(),
        batchId,
        customerId,
        row.quantity,
        row.salePrice,
        LANDED_COST,
        row.stickering !== undefined,
        row.stickering?.cost ?? 0,
        row.stickering?.price ?? 0,
        row.misc ?? 0,
      ],
    );
  }

  beforeEach(async () => {
    await resetDomainData();
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan" });
    const batch = await createBatch(operator, {
      productId,
      supplierId,
      units: 100,
      unitPrice: 1000,
      purchaseDate: iso(new Date(istToday().getTime() - 500 * DAY_MS)),
    });
    batchId = batch.data?.id ?? "";
  });

  it("returns 12 consecutive IST weeks ending with the current Monday, and 12 months ending with this one", async () => {
    const today = istToday();

    const { data: weeks } = await operator.rpc("margin_by_period", { p_grain: "week" });
    expect(weeks).toHaveLength(12);
    const monday = mondayOf(today);
    expect(weeks?.map((w) => w.period_start)).toEqual(
      Array.from({ length: 12 }, (_, i) => iso(new Date(monday.getTime() - (11 - i) * 7 * DAY_MS))),
    );

    const { data: months } = await operator.rpc("margin_by_period", { p_grain: "month" });
    expect(months).toHaveLength(12);
    expect(months?.map((m) => m.period_start)).toEqual(
      Array.from({ length: 12 }, (_, i) => iso(monthsBack(today, 11 - i))),
    );
  });

  it("computes margin, revenue and margin % from the sale, zero-fills empty periods, and ignores misc expense", async () => {
    await insertSale({
      quantity: 10,
      salePrice: 1500,
      stickering: { cost: 50, price: 200 },
      misc: 700,
    });

    for (const grain of ["week", "month"]) {
      const { data } = await operator.rpc("margin_by_period", { p_grain: grain });
      expect(data?.at(-1)).toMatchObject({ margin: 6500, revenue: 17000, margin_pct: 38.24 });
      expect(data?.at(-2)).toMatchObject({ margin: 0, revenue: 0, margin_pct: null });
    }
  });

  it("puts last week's sales in the second-to-last week, archived batches included", async () => {
    const lastWeek = new Date(mondayOf(istToday()).getTime() - 3 * DAY_MS);

    await insertSale({ quantity: 2, salePrice: 1500, saleDate: iso(lastWeek) });
    const archived = await admin.rpc("archive_batch", { p_batch_id: batchId });
    expect(archived.error).toBeNull();

    const { data: weeks } = await operator.rpc("margin_by_period", { p_grain: "week" });
    expect(weeks?.at(-2)).toMatchObject({ period_start: iso(mondayOf(lastWeek)), margin: 1000, revenue: 3000 });
    expect(weeks?.at(-1)).toMatchObject({ margin: 0 });
  });

  it("puts last month's sales in the second-to-last month, archived batches included", async () => {
    const lastMonth = monthsBack(istToday(), 1);
    const midLastMonth = new Date(lastMonth.getTime() + 14 * DAY_MS);

    await insertSale({ quantity: 4, salePrice: 1200, saleDate: iso(midLastMonth) });
    const archived = await admin.rpc("archive_batch", { p_batch_id: batchId });
    expect(archived.error).toBeNull();

    const { data: months } = await operator.rpc("margin_by_period", { p_grain: "month" });
    expect(months?.at(-2)).toMatchObject({ period_start: iso(lastMonth), margin: 800, revenue: 4800 });
    expect(months?.at(-1)).toMatchObject({ margin: 0 });
  });

  it("rejects an unknown grain and refuses anon", async () => {
    const bad = await operator.rpc("margin_by_period", { p_grain: "year" });
    expect(bad.error?.message).toMatch(/unknown grain/i);

    const anon = await anonClient().rpc("margin_by_period", { p_grain: "week" });
    expect(anon.error).not.toBeNull();
    expect(anon.data).toBeNull();
  });
});
