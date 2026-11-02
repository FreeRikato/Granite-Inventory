import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, recordBill, recordSale, today } from "./fixtures";

describe("stickering rate: both Stickering amounts are stored as rates and the per piece figures are derived", () => {
  let operator: Db;
  let admin: Db;
  let customerId: string;
  let productId: string;
  let supplierId: string;
  let jetBatchId: string;
  let memorialBatchId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Jet Black", abbreviation: "JB" });
    const memorialProductId = await createProduct(operator, {
      name: "Doom Stone",
      abbreviation: "DS",
      category: "MEMORIAL",
    });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions" });
    jetBatchId =
      (await createBatch(operator, { productId, supplierId, units: 40, unitPrice: 100, length: 5, breadth: 3 })).data
        ?.id ?? "";
    memorialBatchId =
      (
        await createBatch(operator, {
          productId: memorialProductId,
          supplierId,
          units: 20,
          unitPrice: 1500,
          length: null,
          breadth: null,
          thickness: null,
        })
      ).data?.id ?? "";
  });

  async function stored() {
    const rows = await sql<Record<string, string | null>>(
      `select area_sqft, stickering_rate, stickering_cost_rate, stickering_price, stickering_cost from public.sales`,
    );
    return rows.map((r) => ({
      area_sqft: r.area_sqft === null ? null : Number(r.area_sqft),
      stickering_rate: Number(r.stickering_rate),
      stickering_cost_rate: Number(r.stickering_cost_rate),
      stickering_price: r.stickering_price,
      stickering_cost: r.stickering_cost,
    }));
  }

  async function counts() {
    const rows = await sql<{ sales: string; bills: string }>(
      `select (select count(*) from public.sales) as sales, (select count(*) from public.bills) as bills`,
    );
    return { sales: Number(rows[0]?.sales), bills: Number(rows[0]?.bills) };
  }

  function billLine(batch: string, line: Record<string, unknown>) {
    return operator.rpc("record_bill", {
      p_customer_id: customerId,
      p_sale_date: today(),
      p_payments: [{ payment_mode: "CASH" }],
      p_lines: [{ batch_id: batch, quantity: 1, sale_rate: 100, has_stickering: true, ...line }],
    });
  }

  it("prices Stickering as Area x rate x pieces and keeps the per piece columns", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId: jetBatchId, quantity: 4, saleRate: 100, stickering: { costRate: 40, priceRate: 60 } }],
    });
    expect(error).toBeNull();
    expect(await stored()).toEqual([
      {
        area_sqft: 15,
        stickering_rate: 60,
        stickering_cost_rate: 40,
        stickering_price: "900.00",
        stickering_cost: "600.00",
      },
    ]);

    const { data } = await operator
      .from("v_sales")
      .select("stickering_total, stickering_margin, stickering_rate, stickering_cost_rate")
      .single();
    expect(data).toEqual({
      stickering_total: 3600,
      stickering_margin: 1200,
      stickering_rate: 60,
      stickering_cost_rate: 40,
    });
  });

  it("treats a Memorial rate as per piece", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId: memorialBatchId, quantity: 3, saleRate: 2000, stickering: { costRate: 100, priceRate: 250 } }],
    });
    expect(error).toBeNull();
    expect(await stored()).toEqual([
      {
        area_sqft: null,
        stickering_rate: 250,
        stickering_cost_rate: 100,
        stickering_price: "250.00",
        stickering_cost: "100.00",
      },
    ]);
    const { data } = await operator.from("v_sales").select("stickering_total, stickering_margin").single();
    expect(data).toEqual({ stickering_total: 750, stickering_margin: 450 });
  });

  it("rounds each derived per piece figure to paise", async () => {
    const odd = await createBatch(operator, {
      productId,
      supplierId,
      units: 10,
      unitPrice: 100,
      length: 4.5,
      breadth: 2.25,
      thickness: 16,
    });
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId: odd.data?.id ?? "", saleRate: 100, stickering: { costRate: 10.11, priceRate: 33.33 } }],
    });
    expect(error).toBeNull();
    const [row] = await stored();
    expect(row?.stickering_price).toBe("337.47");
    expect(row?.stickering_cost).toBe("102.36");
  });

  it("leaves both rates at zero when stickering is off", async () => {
    const { error } = await recordBill(operator, { customerId, lines: [{ batchId: jetBatchId, saleRate: 100 }] });
    expect(error).toBeNull();
    const [row] = await stored();
    expect(row).toMatchObject({ stickering_rate: 0, stickering_cost_rate: 0, stickering_price: "0.00" });
  });

  it("refuses a rate whose per piece figure would overflow and records nothing", async () => {
    const refusals = [
      { batch: jetBatchId, line: { stickering_rate: 1.25e9 }, message: "Stickering Price per piece is too large" },
      { batch: jetBatchId, line: { stickering_cost_rate: 1.25e9 }, message: "Stickering Cost per piece is too large" },
      { batch: memorialBatchId, line: { stickering_rate: 1e10 }, message: "Stickering Price per piece is too large" },
      {
        batch: memorialBatchId,
        line: { stickering_cost_rate: 1e10 },
        message: "Stickering Cost per piece is too large",
      },
    ];
    for (const { batch, line, message } of refusals) {
      expect(expectError(await billLine(batch, line)).message).toBe(message);
    }
    expect(await counts()).toEqual({ sales: 0, bills: 0 });
  });

  it("accepts the largest rate whose per piece figure stays below 1,000 crore", async () => {
    expect((await billLine(jetBatchId, { stickering_rate: 6.6e8, stickering_cost_rate: 6.6e8 })).error).toBeNull();
    expect((await counts()).sales).toBe(1);
  });

  it("still refuses a negative or non-numeric rate by its label", async () => {
    const refusals = [
      { line: { stickering_rate: -1 }, message: "Stickering price must be zero or more" },
      { line: { stickering_cost_rate: -1 }, message: "Stickering cost must be zero or more" },
      { line: { stickering_rate: "NaN" }, message: "Stickering price must be a number" },
      { line: { stickering_cost_rate: "Infinity" }, message: "Stickering cost must be a number" },
      {
        line: { has_stickering: false, stickering_rate: 10 },
        message: "Stickering cost and price must be zero when stickering is off",
      },
    ];
    for (const { line, message } of refusals) {
      expect(expectError(await billLine(jetBatchId, line)).message).toBe(message);
    }
    expect(await counts()).toEqual({ sales: 0, bills: 0 });
  });

  it("no longer has record_sale or correct_sale taking a per piece Stickering amount", async () => {
    const left = await sql<{ proname: string }>(
      `select proname from pg_proc
       where proname in ('record_sale', 'correct_sale')
         and ('p_stickering_cost' = any(proargnames) or 'p_stickering_price' = any(proargnames))`,
    );
    expect(left).toEqual([]);

    const args = {
      p_batch_id: jetBatchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 100,
      p_payment_mode: "CASH",
      p_has_stickering: true,
      p_stickering_cost: 600,
      p_stickering_price: 900,
    };
    expect(expectError(await operator.rpc("record_sale", args)).message).toMatch(/p_stickering_cost/);
  });

  it("records a single Sale from rates through record_sale", async () => {
    const { data, error } = await recordSale(operator, {
      batchId: jetBatchId,
      customerId,
      quantity: 4,
      saleRate: 100,
      stickering: { costRate: 40, priceRate: 60 },
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ stickering_rate: 60, stickering_cost_rate: 40, stickering_price: 900 });
  });

  describe("correct_sale", () => {
    let saleId: string;

    beforeEach(async () => {
      await recordBill(operator, {
        customerId,
        lines: [{ batchId: jetBatchId, quantity: 4, saleRate: 100, stickering: { costRate: 40, priceRate: 60 } }],
      });
      saleId = (await sql<{ id: string }>(`select id from public.sales`))[0]?.id ?? "";
    });

    function correct(batch: string, rates: { cost: number; price: number } | null) {
      return admin.rpc("correct_sale", {
        p_sale_id: saleId,
        p_batch_id: batch,
        p_customer_id: customerId,
        p_sale_date: today(),
        p_quantity: 4,
        p_sale_rate: 100,
        p_has_stickering: rates !== null,
        p_stickering_cost_rate: rates?.cost ?? 0,
        p_stickering_rate: rates?.price ?? 0,
      });
    }

    it("re-derives both figures from the new rates and keeps the Sale's own Area", async () => {
      await sql(`update public.sales set area_sqft = 12`);
      expect((await correct(jetBatchId, { cost: 50, price: 70 })).error).toBeNull();
      expect(await stored()).toEqual([
        {
          area_sqft: 12,
          stickering_rate: 70,
          stickering_cost_rate: 50,
          stickering_price: "840.00",
          stickering_cost: "600.00",
        },
      ]);
    });

    it("takes the Area of the new Batch when the Batch changes", async () => {
      const bigger = await createBatch(operator, {
        productId,
        supplierId,
        units: 40,
        unitPrice: 100,
        length: 6,
        breadth: 3,
        thickness: 16,
      });
      expect((await correct(bigger.data?.id ?? "", { cost: 40, price: 60 })).error).toBeNull();
      const [row] = await stored();
      expect(row).toMatchObject({ area_sqft: 18, stickering_price: "1080.00", stickering_cost: "720.00" });
    });

    it("zeroes both rates when stickering is switched off", async () => {
      expect((await correct(jetBatchId, null)).error).toBeNull();
      expect(await stored()).toEqual([
        {
          area_sqft: 15,
          stickering_rate: 0,
          stickering_cost_rate: 0,
          stickering_price: "0.00",
          stickering_cost: "0.00",
        },
      ]);
    });

    it("refuses an overflowing rate and leaves the Sale as it was", async () => {
      expect(expectError(await correct(jetBatchId, { cost: 40, price: 1.25e9 })).message).toBe(
        "Stickering Price per piece is too large",
      );
      expect((await stored())[0]).toMatchObject({ stickering_rate: 60, stickering_price: "900.00" });
    });
  });

  describe("converting an earlier Sale", () => {
    const legacy = [
      { area: 8, price: 480, cost: 320 },
      { area: 10.125, price: 481.55, cost: 320.33 },
      { area: 10.125, price: 0.07, cost: 0.01 },
      { area: 100, price: 9999999.99, cost: 1234567.89 },
      { area: null, price: 250.33, cost: 150 },
    ];

    it("gives back the same per piece amount for every stored figure", async () => {
      const rows = await sql<{ same: boolean }>(
        `with legacy (area, price, cost) as (
           select * from jsonb_to_recordset($1::jsonb) as x (area numeric, price numeric, cost numeric)
         ),
         converted as (
           select area, price, cost,
             round(price / coalesce(area, 1), 10) as price_rate,
             round(cost / coalesce(area, 1), 10) as cost_rate
           from legacy
         )
         select round(coalesce(area, 1) * price_rate, 2) = price
           and round(coalesce(area, 1) * cost_rate, 2) = cost as same
         from converted`,
        [JSON.stringify(legacy)],
      );
      expect(rows).toHaveLength(legacy.length);
      expect(rows.every((r) => r.same)).toBe(true);
    });

    it("keeps Stickering Margin and revenue of a converted Sale", async () => {
      await sql(
        `insert into public.bills (id, customer_id, sale_date) values ('00000000-0000-4000-8000-000000000001', $1, current_date)`,
        [customerId],
      );
      await sql(
        `insert into public.sales (bill_id, sale_date, batch_id, customer_id, quantity, sale_rate, area_sqft, landed_cost,
           has_stickering, stickering_rate, stickering_cost_rate)
         values ('00000000-0000-4000-8000-000000000001', current_date, $1, $2, 3, 250, 10.125, 1000, true,
           round(481.55 / 10.125, 10), round(320.33 / 10.125, 10))`,
        [jetBatchId, customerId],
      );
      const { data } = await operator
        .from("v_sales")
        .select("stickering_price, stickering_cost, stickering_total, stickering_margin")
        .single();
      expect(data).toEqual({
        stickering_price: 481.55,
        stickering_cost: 320.33,
        stickering_total: 1444.65,
        stickering_margin: 483.66,
      });
    });
  });

  it("exposes both rates to chat_query through v_chat_sales", async () => {
    await recordBill(operator, {
      customerId,
      lines: [{ batchId: jetBatchId, quantity: 4, saleRate: 100, stickering: { costRate: 40, priceRate: 60 } }],
    });
    const { data, error } = await operator.rpc("chat_query", {
      q: "select stickering_rate, stickering_cost_rate, stickering_price from v_chat_sales",
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ stickering_rate: 60, stickering_cost_rate: 40, stickering_price: 900 }]);
  });
});
