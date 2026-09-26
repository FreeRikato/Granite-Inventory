import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanPgMessage } from "@/lib/action-result";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, sql, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordSale, today } from "./fixtures";

type ErrorShape = {
  readonly message: string;
  readonly details: string | null;
  readonly hint: string | null;
};

describe("correction hardening: readable validation, stable yard gaps and mapper", () => {
  let admin: Db;
  let operator: Db;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  let batchId: string;
  let secondBatchId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan" });
    batchId = (await createBatch(operator, { productId, supplierId, units: 15, unitPrice: 1000 })).data?.id ?? "";
    secondBatchId = (await createBatch(operator, { productId, supplierId, units: 10, unitPrice: 2000 })).data?.id ?? "";
  });

  function correctBatch(
    db: Db,
    id: string,
    input: { readonly purchaseDate?: string; readonly units?: number; readonly freight?: number; readonly price?: number } = {},
  ) {
    return db.rpc("correct_batch", {
      p_batch_id: id,
      p_product_id: productId,
      p_variant_name: "Grade 1",
      p_supplier_id: supplierId,
      p_purchase_date: input.purchaseDate ?? today(),
      p_length_ft: 4,
      p_breadth_ft: 2,
      p_thickness_mm: 16,
      p_initial_units: input.units ?? 15,
      p_unit_purchase_price: input.price ?? 1000,
      p_freight_cost: input.freight ?? 0,
    });
  }

  function correctSale(
    db: Db,
    saleId: string,
    input: {
      readonly saleDate?: string;
      readonly quantity?: number;
      readonly salePrice?: number;
      readonly paymentMode?: string;
    } = {},
  ) {
    return db.rpc("correct_sale", {
      p_sale_id: saleId,
      p_batch_id: batchId,
      p_customer_id: customerId,
      p_sale_date: input.saleDate ?? today(),
      p_quantity: input.quantity ?? 1,
      p_sale_price: input.salePrice ?? 1650,
      p_payment_mode: input.paymentMode ?? "CASH",
    });
  }

  function expectNoEmail(error: ErrorShape): void {
    if (error.details !== null) expect(error.details).not.toContain("@");
    if (error.hint !== null) expect(error.hint).not.toContain("@");
  }

  it("correct_batch gives a readable purchase-date floor without echoing a row", async () => {
    const error = expectError(await correctBatch(admin, batchId, { purchaseDate: "1900-01-01" }));

    expect(error.message).toMatch(/purchase date.*2000-01-01/i);
    expectNoEmail(error);
  });

  it("refuses moving a Batch purchase date after its earliest Sale", async () => {
    const purchaseDate = daysAgo(3);
    const saleDate = daysAgo(2);

    expect((await correctBatch(admin, batchId, { purchaseDate })).error).toBeNull();
    await recordSale(operator, { batchId, customerId, saleDate });

    const error = expectError(await correctBatch(admin, batchId, { purchaseDate: today() }));
    expect(error.message).toBe(`Purchase date cannot be after a sale on this batch (${saleDate})`);
    expectNoEmail(error);
  });

  it("correct_batch gives readable freight and sold-units messages", async () => {
    const freight = expectError(await correctBatch(admin, batchId, { freight: -1 }));
    expect(freight.message).toMatch(/freight cost.*zero or more/i);
    expectNoEmail(freight);

    await recordSale(operator, { batchId, customerId, quantity: 8 });
    const units = expectError(await correctBatch(admin, batchId, { units: 5 }));
    expect(units.message).toMatch(/already has 8 sold/i);
    expectNoEmail(units);
  });

  it("correct_sale gives readable validation for quantity, price, mode and date", async () => {
    const sale = await recordSale(operator, { batchId, customerId });
    const saleId = sale.data?.id ?? "";

    const invalidInputs = [
      { input: { quantity: 0 }, message: /sale quantity.*greater than zero/i },
      { input: { salePrice: -1 }, message: /sale price.*zero or more/i },
      { input: { paymentMode: "CHEQUE" }, message: /payment mode.*cash.*upi.*bank transfer/i },
      { input: { saleDate: daysAgo(-1) }, message: /sale date.*future/i },
    ];

    for (const invalid of invalidInputs) {
      const error = expectError(await correctSale(admin, saleId, invalid.input));
      expect(error.message).toMatch(invalid.message);
      expectNoEmail(error);
    }
  });

  it("refuses sale dates before purchase and accepts the purchase date for both sale RPCs", async () => {
    const beforePurchase = daysAgo(1);
    const recordError = expectError(
      await recordSale(operator, { batchId, customerId, saleDate: beforePurchase }),
    );
    expect(recordError.message).toBe(`Sale date cannot be before the batch was bought (${today()})`);
    expectNoEmail(recordError);

    const sale = await recordSale(operator, { batchId, customerId, saleDate: today() });
    expect(sale.error).toBeNull();

    const correctionError = expectError(await correctSale(admin, sale.data?.id ?? "", { saleDate: beforePurchase }));
    expect(correctionError.message).toBe(`Sale date cannot be before the batch was bought (${today()})`);
    expectNoEmail(correctionError);

    const corrected = await correctSale(admin, sale.data?.id ?? "", { saleDate: today() });
    expect(corrected.error).toBeNull();
  });

  it("keeps same-day yard gaps identical across five reads", async () => {
    await sql(
      `with updated as (
         update public.batches
         set purchase_date = private.ist_today() - 3
         where id in ($1, $2)
         returning id
       ), source as (
         select variant_id, supplier_id, length_ft, breadth_ft, thickness_mm, slot, initial_units, unit_purchase_price, freight_cost
         from public.batches where id = $1
       ), tie_a as (
         insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, initial_units, unit_purchase_price, freight_cost)
         select 'T09-TIE-A', variant_id, supplier_id, private.ist_today(), length_ft, breadth_ft, thickness_mm, slot, initial_units, unit_purchase_price, freight_cost
         from source
       )
       insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, initial_units, unit_purchase_price, freight_cost)
       select 'T09-TIE-B', variant_id, supplier_id, private.ist_today(), length_ft, breadth_ft, thickness_mm, slot, initial_units, unit_purchase_price, freight_cost
       from source;`,
      [batchId, secondBatchId],
    );

    const readings: Array<Array<readonly [string, number | null]>> = [];
    for (const readNumber of [1, 2, 3, 4, 5]) {
      const rows = await sql<{ batch_code: string; days_since_previous: number | null }>(
        `select $1::integer as read_number, batch_code, days_since_previous
         from public.v_yard_batches
         where batch_code in ('T09-TIE-A', 'T09-TIE-B')
         order by batch_code`,
        [readNumber],
      );
      readings.push(rows.map((row) => [row.batch_code, row.days_since_previous]));
    }

    expect(readings).toHaveLength(5);
    expect(readings.every((reading) => JSON.stringify(reading) === JSON.stringify(readings[0]))).toBe(true);
    expect(readings[0]).toEqual([
      ["T09-TIE-A", 3],
      ["T09-TIE-B", 0],
    ]);
  });

  it("maps the renamed purchase-date constraint to friendly text", () => {
    expect(cleanPgMessage('new row violates check constraint "batches_purchase_date_range"')).toBe(
      "Purchase date cannot be in the future",
    );
  });

  it("allows a valid correction end to end", async () => {
    const corrected = await correctBatch(admin, batchId, { price: 1200, units: 15 });

    expect(corrected.error).toBeNull();
    expect(corrected.data?.landed_cost).toBe(1200);
  });

  it("uses the destination batch purchase date when correcting a moved Sale", async () => {
    const purchaseDate = daysAgo(3);
    const saleDate = daysAgo(2);

    expect((await correctBatch(admin, batchId, { purchaseDate })).error).toBeNull();
    const sale = await recordSale(operator, { batchId, customerId, saleDate });
    const movedBeforeDestination = await admin.rpc("correct_sale", {
      p_sale_id: sale.data?.id ?? "",
      p_batch_id: secondBatchId,
      p_customer_id: customerId,
      p_sale_date: saleDate,
      p_quantity: 1,
      p_sale_price: 1650,
      p_payment_mode: "CASH",
    });

    const error = expectError(movedBeforeDestination);
    expect(error.message).toBe(`Sale date cannot be before the batch was bought (${today()})`);
    expectNoEmail(error);

    const moved = await admin.rpc("correct_sale", {
      p_sale_id: sale.data?.id ?? "",
      p_batch_id: secondBatchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_price: 1650,
      p_payment_mode: "CASH",
    });

    expect(moved.error).toBeNull();
  });

  it("reports an unknown customer before input errors", async () => {
    const error = expectError(
      await operator.rpc("record_sale", {
        p_batch_id: batchId,
        p_customer_id: "00000000-0000-0000-0000-000000000000",
        p_sale_date: today(),
        p_quantity: 0,
        p_sale_price: 1650,
        p_payment_mode: "CASH",
      }),
    );

    expect(error.message).toBe("Unknown customer");
  });
});
