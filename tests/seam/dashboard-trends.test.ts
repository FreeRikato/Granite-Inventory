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

describe("dashboard trends: top_customers", () => {
  let operator: Db;
  let blackGalaxyBatch: string;
  let blackGalaxyBatchTwo: string;
  let tanBrownBatch: string;
  let whiteBatch: string;
  let absoluteBlackBatch: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  async function insertSale(input: {
    customerId: string;
    batchId: string;
    quantity: number;
    salePrice: number;
    daysAgo?: number;
    stickeringPrice?: number;
  }) {
    const saleDate = iso(new Date(istToday().getTime() - (input.daysAgo ?? 0) * DAY_MS));
    await sql(
      `insert into public.sales (sale_date, batch_id, customer_id, quantity, sale_price, landed_cost, has_stickering, stickering_cost, stickering_price, payment_mode)
       values ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'CASH')`,
      [
        saleDate,
        input.batchId,
        input.customerId,
        input.quantity,
        input.salePrice,
        LANDED_COST,
        input.stickeringPrice !== undefined,
        input.stickeringPrice ?? 0,
      ],
    );
  }

  beforeEach(async () => {
    await resetDomainData();
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const purchaseDate = iso(new Date(istToday().getTime() - 500 * DAY_MS));
    const blackGalaxy = await createProduct(operator, { name: "Black Galaxy", abbreviation: "BG" });
    const tanBrown = await createProduct(operator, { name: "Tan Brown", abbreviation: "TB" });
    const white = await createProduct(operator, { name: "Kashmir White", abbreviation: "KW" });
    const absoluteBlack = await createProduct(operator, { name: "Absolute Black", abbreviation: "AB" });
    const batch = async (productId: string, stackNumber: string) =>
      (await createBatch(operator, { productId, supplierId, units: 500, unitPrice: 1000, purchaseDate, stackNumber }))
        .data?.id ?? "";
    blackGalaxyBatch = await batch(blackGalaxy, "1");
    blackGalaxyBatchTwo = await batch(blackGalaxy, "2");
    tanBrownBatch = await batch(tanBrown, "1");
    whiteBatch = await batch(white, "1");
    absoluteBlackBatch = await batch(absoluteBlack, "1");
  });

  it("ranks the top 5 by billed with stickering included, and applies the month, 90 day and all windows", async () => {
    const names = ["Anand", "Balu", "Chitra", "Dev", "Eswar", "Farook"];
    const ids: string[] = [];
    for (const name of names) ids.push(await createCustomer(operator, { name }));
    const [anand, balu, chitra, dev, eswar, farook] = ids;

    await insertSale({ customerId: balu, batchId: blackGalaxyBatch, quantity: 20, salePrice: 1500 });
    await insertSale({
      customerId: anand,
      batchId: blackGalaxyBatch,
      quantity: 10,
      salePrice: 1000,
      stickeringPrice: 200,
    });
    await insertSale({ customerId: chitra, batchId: blackGalaxyBatch, quantity: 4, salePrice: 1000 });
    await insertSale({ customerId: dev, batchId: blackGalaxyBatch, quantity: 3, salePrice: 1000 });
    await insertSale({ customerId: eswar, batchId: blackGalaxyBatch, quantity: 2, salePrice: 1000 });
    await insertSale({ customerId: farook, batchId: blackGalaxyBatch, quantity: 1, salePrice: 1000 });
    await insertSale({ customerId: farook, batchId: blackGalaxyBatch, quantity: 50, salePrice: 1000, daysAgo: 91 });

    const { data: ninety } = await operator.rpc("top_customers", { p_window: "90d" });
    expect(ninety).toHaveLength(5);
    expect(ninety?.map((r) => [r.customer_name, r.billed])).toEqual([
      ["Balu", 30000],
      ["Anand", 12000],
      ["Chitra", 4000],
      ["Dev", 3000],
      ["Eswar", 2000],
    ]);

    const { data: all } = await operator.rpc("top_customers", { p_window: "all", p_limit: 10 });
    expect(all?.[0]).toMatchObject({ customer_name: "Farook", billed: 51000, pieces: 51 });
    expect(all?.map((r) => r.customer_name)).toEqual(["Farook", "Balu", "Anand", "Chitra", "Dev", "Eswar"]);
  });

  it("leaves a sale from before this IST month out of the month window", async () => {
    const [anand, balu] = [
      await createCustomer(operator, { name: "Anand" }),
      await createCustomer(operator, { name: "Balu" }),
    ];
    const today = istToday();
    const daysIntoMonth = Math.round((today.getTime() - firstOfMonth(today).getTime()) / DAY_MS);
    await insertSale({ customerId: anand, batchId: blackGalaxyBatch, quantity: 1, salePrice: 1000 });
    await insertSale({
      customerId: balu,
      batchId: blackGalaxyBatch,
      quantity: 9,
      salePrice: 1000,
      daysAgo: daysIntoMonth + 1,
    });

    const { data: month } = await operator.rpc("top_customers", { p_window: "month" });
    expect(month?.map((r) => r.customer_name)).toEqual(["Anand"]);

    const { data: all } = await operator.rpc("top_customers", { p_window: "all" });
    expect(all?.map((r) => r.customer_name)).toEqual(["Balu", "Anand"]);
  });

  it("lists each Product once, summed across Batches, by pieces then name, and ranks the Walk-in Customer", async () => {
    const [{ id: walkIn }] = await sql<{ id: string }>(`select id from public.customers where is_walk_in`);
    const anand = await createCustomer(operator, { name: "Anand" });

    await insertSale({ customerId: walkIn, batchId: blackGalaxyBatch, quantity: 30, salePrice: 1000 });
    await insertSale({ customerId: walkIn, batchId: blackGalaxyBatchTwo, quantity: 90, salePrice: 1000 });
    await insertSale({ customerId: walkIn, batchId: tanBrownBatch, quantity: 60, salePrice: 1000 });
    await insertSale({ customerId: walkIn, batchId: whiteBatch, quantity: 40, salePrice: 1000 });
    await insertSale({ customerId: walkIn, batchId: absoluteBlackBatch, quantity: 40, salePrice: 1000 });
    await insertSale({ customerId: anand, batchId: whiteBatch, quantity: 1, salePrice: 1000 });

    const { data } = await operator.rpc("top_customers", { p_window: "90d" });
    expect(data?.[0]).toMatchObject({
      customer_id: walkIn,
      billed: 260000,
      pieces: 260,
      products: [
        { name: "Black Galaxy", pieces: 120 },
        { name: "Tan Brown", pieces: 60 },
        { name: "Absolute Black", pieces: 40 },
        { name: "Kashmir White", pieces: 40 },
      ],
    });
    expect(data?.[0]?.customer_name).toBeTruthy();
    expect(data?.[1]).toMatchObject({ customer_name: "Anand", products: [{ name: "Kashmir White", pieces: 1 }] });
  });

  it("rejects an unknown window and refuses anon", async () => {
    const bad = await operator.rpc("top_customers", { p_window: "year" });
    expect(bad.error?.message).toMatch(/unknown window/i);

    const anon = await anonClient().rpc("top_customers", { p_window: "90d" });
    expect(anon.error).not.toBeNull();
    expect(anon.data).toBeNull();
  });
});
