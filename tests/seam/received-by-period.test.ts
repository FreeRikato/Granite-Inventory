import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import {
  createBatch,
  createCustomer,
  createProduct,
  createSupplier,
  daysAgo,
  recordBill,
  recordSale,
  today,
  type BillPayment,
} from "./fixtures";

const DAY_MS = 86_400_000;
const PIECE_RATE = 125;

function istToday(): Date {
  return new Date(`${today()}T00:00:00Z`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mondayOf(d: Date): Date {
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
}
function monthsBack(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}

describe("received_by_period", () => {
  let operator: Db;
  let admin: Db;
  let batchId: string;
  let customerId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
  });

  beforeEach(async () => {
    await resetDomainData();
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan" });
    const batch = await createBatch(operator, {
      productId,
      supplierId,
      units: 1000,
      unitPrice: 100,
      purchaseDate: daysAgo(500),
    });
    batchId = batch.data?.id ?? "";
  });

  async function bill(saleDate: string, payments: readonly BillPayment[], pieces: number) {
    const { error } = await recordBill(operator, {
      customerId,
      saleDate,
      payments,
      lines: [{ batchId, quantity: pieces, saleRate: PIECE_RATE }],
    });
    expect(error).toBeNull();
  }

  async function sale(saleDate: string, paymentMode: "CASH" | "UPI" | "BANK_TRANSFER", pieces: number) {
    const { error } = await recordSale(operator, {
      batchId,
      customerId,
      saleDate,
      quantity: pieces,
      saleRate: PIECE_RATE,
      paymentMode,
    });
    expect(error).toBeNull();
  }

  async function received(range: "week" | "month") {
    const { data, error } = await operator.rpc("received_by_period", { p_range: range });
    expect(error).toBeNull();
    return data ?? [];
  }

  async function custom(from: string, to: string) {
    const { data, error } = await operator.rpc("received_by_period", { p_range: "custom", p_from: from, p_to: to });
    expect(error).toBeNull();
    return data ?? [];
  }

  it("adds a split Bill to each of its modes and counts a Sale without a Bill under its one mode", async () => {
    await bill(
      today(),
      [
        { payment_mode: "CASH", amount: 30000 },
        { payment_mode: "UPI", amount: 20000 },
      ],
      50,
    );
    await bill(today(), [{ payment_mode: "UPI" }], 10);
    await sale(today(), "BANK_TRANSFER", 4);
    await sale(today(), "CASH", 2);

    const rows = await custom(today(), today());
    expect(rows).toEqual([{ period_start: today(), cash: 32000, upi: 30000, bank_transfer: 4000, total: 66000 }]);
    expect((await received("week")).at(-1)).toMatchObject({
      cash: 32000,
      upi: 30000,
      bank_transfer: 4000,
      total: 66000,
    });
    expect((await received("month")).at(-1)).toMatchObject({
      cash: 32000,
      upi: 30000,
      bank_transfer: 4000,
      total: 66000,
    });
  });

  it("returns 12 IST weeks ending with the current Monday and 12 months ending with this one, zero when empty", async () => {
    const monday = mondayOf(istToday());
    const weeks = await received("week");
    expect(weeks).toHaveLength(12);
    expect(weeks.map((w) => w.period_start)).toEqual(
      Array.from({ length: 12 }, (_, i) => iso(new Date(monday.getTime() - (11 - i) * 7 * DAY_MS))),
    );
    const months = await received("month");
    expect(months).toHaveLength(12);
    expect(months.map((m) => m.period_start)).toEqual(
      Array.from({ length: 12 }, (_, i) => iso(monthsBack(istToday(), 11 - i))),
    );
    for (const row of [...weeks, ...months]) {
      expect(row).toMatchObject({ cash: 0, upi: 0, bank_transfer: 0, total: 0 });
    }
  });

  it("starts a week on Monday: the late Sunday sale closes the old week, the just-after-midnight Monday sale opens the new one", async () => {
    const monday = mondayOf(istToday());
    const sunday = iso(new Date(monday.getTime() - DAY_MS));
    await sale(sunday, "CASH", 3);
    await sale(iso(monday), "UPI", 5);
    await sql(
      `update public.sales set created_at = (sale_date + time '23:30') at time zone 'Asia/Kolkata' where sale_date = $1`,
      [sunday],
    );
    await sql(
      `update public.sales set created_at = (sale_date + time '00:05') at time zone 'Asia/Kolkata' where sale_date = $1`,
      [iso(monday)],
    );

    const weeks = await received("week");
    expect(weeks.at(-2)).toMatchObject({
      period_start: iso(mondayOf(new Date(monday.getTime() - DAY_MS))),
      cash: 3000,
      upi: 0,
    });
    expect(weeks.at(-1)).toMatchObject({ period_start: iso(monday), cash: 0, upi: 5000 });
  });

  it("starts a month on the 1st: the sale on the last day closes the old month, the one on the 1st opens the new one", async () => {
    const first = monthsBack(istToday(), 0);
    const lastOfPrevious = new Date(first.getTime() - DAY_MS);
    await sale(iso(lastOfPrevious), "CASH", 3);
    await sale(iso(first), "UPI", 5);
    await sql(
      `update public.sales set created_at = (sale_date + time '23:30') at time zone 'Asia/Kolkata' where sale_date = $1`,
      [iso(lastOfPrevious)],
    );
    await sql(
      `update public.sales set created_at = (sale_date + time '00:05') at time zone 'Asia/Kolkata' where sale_date = $1`,
      [iso(first)],
    );

    const months = await received("month");
    expect(months.at(-2)).toMatchObject({ period_start: iso(monthsBack(istToday(), 1)), cash: 3000, upi: 0 });
    expect(months.at(-1)).toMatchObject({ period_start: iso(first), cash: 0, upi: 5000 });
  });

  it("leaves out Sales older than the 12 periods and keeps the oldest period's", async () => {
    const monday = mondayOf(istToday());
    const oldestStart = new Date(monday.getTime() - 11 * 7 * DAY_MS);
    await sale(iso(oldestStart), "CASH", 2);
    await sale(iso(new Date(oldestStart.getTime() - DAY_MS)), "CASH", 7);
    const weeks = await received("week");
    expect(weeks[0]).toMatchObject({ period_start: iso(oldestStart), cash: 2000 });
    expect(weeks.reduce((sum, w) => sum + w.total, 0)).toBe(2000);
  });

  it("gives Custom one row per day, zero days included, oldest first", async () => {
    await bill(
      daysAgo(3),
      [
        { payment_mode: "CASH", amount: 1500 },
        { payment_mode: "BANK_TRANSFER", amount: 500 },
      ],
      2,
    );
    await sale(daysAgo(1), "UPI", 3);
    await sale(daysAgo(10), "UPI", 9);

    const rows = await custom(daysAgo(4), today());
    expect(rows).toEqual([
      { period_start: daysAgo(4), cash: 0, upi: 0, bank_transfer: 0, total: 0 },
      { period_start: daysAgo(3), cash: 1500, upi: 0, bank_transfer: 500, total: 2000 },
      { period_start: daysAgo(2), cash: 0, upi: 0, bank_transfer: 0, total: 0 },
      { period_start: daysAgo(1), cash: 0, upi: 3000, bank_transfer: 0, total: 3000 },
      { period_start: today(), cash: 0, upi: 0, bank_transfer: 0, total: 0 },
    ]);
    expect(await custom(today(), today())).toHaveLength(1);
  });

  it("refuses an end date in the future, a start after the end, missing dates and an unknown range", async () => {
    const future = await operator.rpc("received_by_period", { p_range: "custom", p_from: today(), p_to: daysAgo(-1) });
    expect(expectError(future).message).toBe("The end date cannot be in the future");
    const backwards = await operator.rpc("received_by_period", {
      p_range: "custom",
      p_from: today(),
      p_to: daysAgo(1),
    });
    expect(expectError(backwards).message).toBe("The start date must be on or before the end date");
    const missing = await operator.rpc("received_by_period", { p_range: "custom", p_from: today() });
    expect(expectError(missing).message).toBe("Pick a start and end date");
    const unknown = await operator.rpc("received_by_period", { p_range: "year" });
    expect(expectError(unknown).message).toMatch(/unknown range/i);
  });

  it("lets an Admin and a Yard Operator read it and refuses anon", async () => {
    await sale(today(), "UPI", 1);
    for (const db of [operator, admin]) {
      const { data, error } = await db.rpc("received_by_period", { p_range: "week" });
      expect(error).toBeNull();
      expect(data?.at(-1)).toMatchObject({ upi: 1000, total: 1000 });
    }
    const anon = await anonClient().rpc("received_by_period", { p_range: "week" });
    expect(anon.error).not.toBeNull();
    expect(anon.data).toBeNull();
  });

  it("adds up to the revenue of every Sale, Stickering included", async () => {
    await bill(daysAgo(40), [{ payment_mode: "CASH" }], 4);
    await bill(
      daysAgo(8),
      [
        { payment_mode: "CASH", amount: 500 },
        { payment_mode: "UPI", amount: 1500 },
      ],
      2,
    );
    await sale(daysAgo(2), "BANK_TRANSFER", 3);
    const stickered = await recordSale(operator, {
      batchId,
      customerId,
      saleDate: today(),
      quantity: 2,
      saleRate: PIECE_RATE,
      paymentMode: "UPI",
      stickering: { costRate: 10, priceRate: 25 },
    });
    expect(stickered.error).toBeNull();

    const [{ revenue }] = await sql<{ revenue: string }>(
      `select sum(quantity * (sale_price + stickering_price)) as revenue from public.sales`,
    );
    const months = await received("month");
    const weeks = await received("week");
    expect(months.reduce((sum, m) => sum + m.total, 0)).toBe(Number(revenue));
    expect(weeks.reduce((sum, w) => sum + w.total, 0)).toBe(Number(revenue));
    expect(weeks.every((w) => w.total === w.cash + w.upi + w.bank_transfer)).toBe(true);
  });
});
