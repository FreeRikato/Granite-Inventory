import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, type Db } from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordBill, today } from "./fixtures";

describe("bill corrections: delete_sale and correct_sale on a Bill's Sales", () => {
  let admin: Db;
  let operator: Db;
  let customerId: string;
  let blackBatchId: string;
  let pearlBatchId: string;
  let billId: string;
  let blackSaleId: string;
  let pearlSaleId: string;

  beforeAll(async () => {
    await ensureTestUsers();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    const black = await createProduct(operator, { name: "Absolute Black", abbreviation: "AB" });
    const pearl = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: "Murugan Constructions" });
    blackBatchId =
      (await createBatch(operator, { productId: black, supplierId, units: 15, unitPrice: 175 })).data?.id ?? "";
    pearlBatchId =
      (await createBatch(operator, { productId: pearl, supplierId, units: 20, unitPrice: 200 })).data?.id ?? "";
    const recorded = await recordBill(operator, {
      customerId,
      lines: [
        { batchId: blackBatchId, quantity: 4 },
        { batchId: pearlBatchId, quantity: 5 },
      ],
    });
    expect(recorded.error).toBeNull();
    const sales = await admin.from("sales").select("id, batch_id, bill_id");
    billId = sales.data?.[0]?.bill_id ?? "";
    blackSaleId = sales.data?.find((s) => s.batch_id === blackBatchId)?.id ?? "";
    pearlSaleId = sales.data?.find((s) => s.batch_id === pearlBatchId)?.id ?? "";
  });

  async function availableOf(batchId: string): Promise<number | undefined> {
    const { data } = await admin.from("v_batches").select("available").eq("id", batchId).single();
    return data?.available ?? undefined;
  }

  function correctQuantity(saleId: string, batchId: string, quantity: number) {
    return admin.rpc("correct_sale", {
      p_sale_id: saleId,
      p_batch_id: batchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: quantity,
      p_sale_rate: 206.25,
      p_payment_mode: "CASH",
    });
  }

  it("deleting one of two Sales keeps the Bill; deleting the last removes it", async () => {
    expect(billId).not.toBe("");

    const first = await admin.rpc("delete_sale", { p_sale_id: blackSaleId });
    expect(first.error).toBeNull();
    expect((await admin.from("bills").select("id").eq("id", billId)).data).toHaveLength(1);
    expect((await admin.from("sales").select("id").eq("bill_id", billId)).data).toHaveLength(1);
    expect(await availableOf(blackBatchId)).toBe(15);

    const last = await admin.rpc("delete_sale", { p_sale_id: pearlSaleId });
    expect(last.error).toBeNull();
    expect((await admin.from("bills").select("id").eq("id", billId)).data).toEqual([]);
    expect(await availableOf(pearlBatchId)).toBe(20);
  });

  it("deleting a Sale from one Bill leaves another customer Bill alone", async () => {
    const other = await recordBill(operator, { customerId, lines: [{ batchId: blackBatchId, quantity: 1 }] });
    expect(other.error).toBeNull();
    const bills = await admin.from("bills").select("id");
    expect(bills.data).toHaveLength(2);

    await admin.rpc("delete_sale", { p_sale_id: blackSaleId });
    await admin.rpc("delete_sale", { p_sale_id: pearlSaleId });
    const remaining = await admin.from("bills").select("id");
    expect(remaining.data).toHaveLength(1);
    expect(remaining.data?.[0]?.id).not.toBe(billId);
  });

  it("correcting a Bill Sale's quantity keeps its Bill and rebalances the Batch", async () => {
    const changed = await correctQuantity(blackSaleId, blackBatchId, 7);
    expect(changed.error).toBeNull();
    expect(changed.data?.bill_id).toBe(billId);
    expect(changed.data?.quantity).toBe(7);
    expect(await availableOf(blackBatchId)).toBe(8);
    const stored = await admin.from("sales").select("bill_id").eq("id", blackSaleId).single();
    expect(stored.data?.bill_id).toBe(billId);
  });

  it("refuses changing a Bill Sale's customer, date or payment mode and changes nothing", async () => {
    const otherCustomerId = await createCustomer(operator, { name: "Other Buyer" });
    const sameHeader = {
      p_sale_id: blackSaleId,
      p_batch_id: blackBatchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 4,
      p_sale_rate: 206.25,
      p_payment_mode: "CASH",
    };
    const changes = [{ p_customer_id: otherCustomerId }, { p_sale_date: daysAgo(1) }, { p_payment_mode: "UPI" }];

    for (const change of changes) {
      const refused = await admin.rpc("correct_sale", { ...sameHeader, ...change });
      expect(expectError(refused).message).toMatch(/^Customer, sale date and payment mode come from the bill/);
    }

    const stored = await admin
      .from("sales")
      .select("customer_id, sale_date, payment_mode, bill_id")
      .eq("id", blackSaleId)
      .single();
    expect(stored.data).toEqual({
      customer_id: customerId,
      sale_date: today(),
      payment_mode: "CASH",
      bill_id: billId,
    });
  });

  it("lets a Bill Sale change its price, stickering and Batch while the header stays", async () => {
    const changed = await admin.rpc("correct_sale", {
      p_sale_id: blackSaleId,
      p_batch_id: pearlBatchId,
      p_customer_id: customerId,
      p_sale_date: today(),
      p_quantity: 2,
      p_sale_rate: 250,
      p_payment_mode: "CASH",
      p_has_stickering: true,
      p_stickering_cost: 50,
      p_stickering_price: 120,
    });
    expect(changed.error).toBeNull();
    expect(changed.data).toMatchObject({
      bill_id: billId,
      batch_id: pearlBatchId,
      quantity: 2,
      sale_rate: 250,
      has_stickering: true,
    });
  });

  it("correcting a Bill Sale past what the Batch has is refused and changes nothing", async () => {
    const refused = await correctQuantity(blackSaleId, blackBatchId, 16);
    expect(expectError(refused).message).toMatch(/Only 15 available/);
    expect(await availableOf(blackBatchId)).toBe(11);
    const stored = await admin.from("sales").select("quantity, bill_id").eq("id", blackSaleId).single();
    expect(stored.data).toEqual({ quantity: 4, bill_id: billId });
  });
});
