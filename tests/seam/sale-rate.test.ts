import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, recordBill, today } from "./fixtures";

describe("sale rate: the Sale Rate is stored and the per piece Sale Price is derived", () => {
  let operator: Db;
  let admin: Db;
  let customerId: string;
  let productId: string;
  let supplierId: string;
  let memorialProductId: string;
  let batchId: string;
  let memorialBatchId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    memorialProductId = await createProduct(operator, { name: "Doom Stone", abbreviation: "DS", category: "MEMORIAL" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions" });
    batchId = (await createBatch(operator, { productId, supplierId, units: 40, unitPrice: 181.25 })).data?.id ?? "";
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

  async function storedSale() {
    const rows = await sql<{ sale_rate: string; area_sqft: string | null; sale_price: string }>(
      `select sale_rate, area_sqft, sale_price from public.sales`,
    );
    return rows.map((r) => ({
      sale_rate: Number(r.sale_rate),
      area_sqft: r.area_sqft === null ? null : Number(r.area_sqft),
      sale_price: r.sale_price,
    }));
  }

  async function saleCount(): Promise<number> {
    const rows = await sql<{ n: string }>(`select count(*) as n from public.sales`);
    return Number(rows[0]?.n);
  }

  async function billCount(): Promise<number> {
    const rows = await sql<{ n: string }>(`select count(*) as n from public.bills`);
    return Number(rows[0]?.n);
  }

  function billLine(batch: string, line: Record<string, unknown>) {
    return operator.rpc("record_bill", {
      p_customer_id: customerId,
      p_sale_date: today(),
      p_payment_mode: "CASH",
      p_lines: [{ batch_id: batch, quantity: 1, ...line }],
    });
  }

  it("stores the rate and the Area of one piece and derives the Sale Price", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId, quantity: 10, saleRate: 250 }],
    });
    expect(error).toBeNull();
    expect(await storedSale()).toEqual([{ sale_rate: 250, area_sqft: 8, sale_price: "2000.00" }]);

    const { data } = await operator.from("v_sales").select("stone_total, revenue").single();
    expect(data).toEqual({ stone_total: 20000, revenue: 20000 });
  });

  it("stores no Area for a Memorial and keeps its rate per piece", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId: memorialBatchId, quantity: 10, saleRate: 2000 }],
    });
    expect(error).toBeNull();
    expect(await storedSale()).toEqual([{ sale_rate: 2000, area_sqft: null, sale_price: "2000.00" }]);
  });

  it("rounds the derived Sale Price to paise", async () => {
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
      lines: [{ batchId: odd.data?.id ?? "", quantity: 1, saleRate: 33.33 }],
    });
    expect(error).toBeNull();
    expect(await storedSale()).toEqual([{ sale_rate: 33.33, area_sqft: 10.125, sale_price: "337.47" }]);
  });

  it("derives stone and stickering margin from the per piece Sale Price", async () => {
    const { error } = await recordBill(operator, {
      customerId,
      lines: [{ batchId, quantity: 10, saleRate: 250, stickering: { cost: 100, price: 300 } }],
    });
    expect(error).toBeNull();
    const { data } = await operator
      .from("v_sales")
      .select("landed_cost, stone_margin, stickering_margin, margin, revenue, margin_pct")
      .single();
    expect(data).toEqual({
      landed_cost: 1450,
      stone_margin: 5500,
      stickering_margin: 2000,
      margin: 7500,
      revenue: 23000,
      margin_pct: 32.61,
    });
  });

  it("refuses a missing, negative, non-numeric or oversized rate and records nothing", async () => {
    const refusals = [
      { line: {}, message: "Sale rate is required" },
      { line: { sale_rate: -1 }, message: "Sale rate must be zero or more" },
      { line: { sale_rate: "NaN" }, message: "Sale rate must be a number" },
      { line: { sale_rate: "Infinity" }, message: "Sale rate must be a number" },
      { line: { sale_rate: 1.25e9 }, message: "Sale Price per piece is too large" },
    ];
    for (const { line, message } of refusals) {
      expect(expectError(await billLine(batchId, line)).message).toBe(message);
    }
    expect(expectError(await billLine(memorialBatchId, { sale_rate: 1e10 })).message).toBe(
      "Sale Price per piece is too large",
    );
    expect(await saleCount()).toBe(0);
    expect(await billCount()).toBe(0);
  });

  it("accepts the largest rate whose Sale Price per piece stays below 1,000 crore", async () => {
    expect((await billLine(batchId, { sale_rate: 1.2e9 })).error).toBeNull();
    expect(await saleCount()).toBe(1);
  });

  it("no longer has record_sale or correct_sale taking a per piece price", async () => {
    const left = await sql<{ proname: string }>(
      `select proname from pg_proc where proname in ('record_sale', 'correct_sale') and 'p_sale_price' = any(proargnames)`,
    );
    expect(left).toEqual([]);

    const sale = await recordBill(operator, { customerId, lines: [{ batchId, saleRate: 250 }] });
    expect(sale.error).toBeNull();
    const args = {
      p_batch_id: batchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 250,
      p_sale_price: 2000,
      p_payment_mode: "CASH",
    };
    expect(expectError(await operator.rpc("record_sale", args)).message).toMatch(/p_sale_price/);
    const saleId = (await sql<{ id: string }>(`select id from public.sales`))[0]?.id ?? "";
    expect(expectError(await admin.rpc("correct_sale", { ...args, p_sale_id: saleId })).message).toMatch(
      /p_sale_price/,
    );
  });

  describe("correct_sale", () => {
    let saleId: string;

    beforeEach(async () => {
      await recordBill(operator, { customerId, lines: [{ batchId, quantity: 10, saleRate: 250 }] });
      saleId = (await sql<{ id: string }>(`select id from public.sales`))[0]?.id ?? "";
    });

    function correct(batch: string, rate: number) {
      return admin.rpc("correct_sale", {
        p_sale_id: saleId,
        p_batch_id: batch,
        p_customer_id: customerId,
        p_sale_date: today(),
        p_quantity: 10,
        p_sale_rate: rate,
        p_payment_mode: "CASH",
      });
    }

    it("re-derives the Sale Price and keeps the Area on the same Batch", async () => {
      expect((await correct(batchId, 300)).error).toBeNull();
      expect(await storedSale()).toEqual([{ sale_rate: 300, area_sqft: 8, sale_price: "2400.00" }]);
    });

    it("keeps the Sale's own Area rather than re-reading the Batch", async () => {
      await sql(`update public.sales set area_sqft = 7.5 where id = $1`, [saleId]);
      expect((await correct(batchId, 300)).error).toBeNull();
      expect(await storedSale()).toEqual([{ sale_rate: 300, area_sqft: 7.5, sale_price: "2250.00" }]);
    });

    it("takes the Area and Landed Cost of the new Batch when the Batch changes", async () => {
      const bigger = await createBatch(operator, {
        productId,
        supplierId,
        units: 40,
        unitPrice: 200,
        length: 5,
        breadth: 2,
        thickness: 16,
      });
      expect((await correct(bigger.data?.id ?? "", 300)).error).toBeNull();
      expect(await storedSale()).toEqual([{ sale_rate: 300, area_sqft: 10, sale_price: "3000.00" }]);
      const { data } = await operator.from("v_sales").select("landed_cost").single();
      expect(data?.landed_cost).toBe(2000);
    });

    it("refuses a missing rate and leaves the Sale as it was", async () => {
      expect(expectError(await correct(batchId, Number.NaN)).message).toBe("Sale rate is required");
      expect(await storedSale()).toEqual([{ sale_rate: 250, area_sqft: 8, sale_price: "2000.00" }]);
    });
  });

  it("exposes sale_rate and area_sqft to chat_query through v_chat_sales", async () => {
    await recordBill(operator, { customerId, lines: [{ batchId, quantity: 10, saleRate: 250 }] });
    const { data, error } = await operator.rpc("chat_query", {
      q: "select sale_rate, area_sqft from v_chat_sales",
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ sale_rate: 250, area_sqft: 8 }]);
  });
});
