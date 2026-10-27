import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureTestUsers, signedInClient, sql, type Db } from "./harness";
import { createBatch, createProduct, createSupplier } from "./fixtures";
import { createCustomerAction } from "@/app/(app)/customers/actions";
import {
  findCustomerByPhone,
  readCustomerList,
  readCustomerOptions,
  readStockLines,
  readYardBatches,
} from "@/lib/query/reads";

const server = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => server.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const CUSTOMER_TAG = "ZZPG Customer";
const BATCH_TAG = "ZZPG-";
const CUSTOMER_COUNT = 1501;
const BATCH_COUNT = 1100;

describe("list reads return every row past the 1,000 row cap", () => {
  let operator: Db;
  let productId = "";
  let supplierId = "";
  let variantId = "";
  let productName = "";

  async function cleanup() {
    await sql(`delete from public.batches where batch_code like '${BATCH_TAG}%'`);
    await sql(`delete from public.customers where name like '${CUSTOMER_TAG}%'`);
  }

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    await cleanup();
    await sql(
      `insert into public.customers (name, phone, customer_type)
       select '${CUSTOMER_TAG} ' || lpad(n::text, 4, '0'),
              '+91 9' || lpad(n::text, 9, '0'),
              case when n <= 300 then 'CONTRACTOR' when n <= 600 then 'TRUST' else 'REGULAR' end
       from generate_series(1, ${CUSTOMER_COUNT}) n`,
    );
    productName = `ZZPG Stone ${Date.now()}`;
    productId = await createProduct(operator, { name: productName, abbreviation: "ZZP" }).catch(async () => {
      const { data } = await operator.from("products").select("id").eq("abbreviation", "ZZP").single();
      return data?.id ?? "";
    });
    supplierId = await createSupplier(operator, `ZZPG Supplier ${Date.now()}`);
    const { data: seed, error } = await createBatch(operator, {
      productId,
      supplierId,
      stackNumber: "1",
      slot: "4FT",
    });
    if (error || !seed) throw error ?? new Error("seed batch missing");
    const [{ variant_id }] = await sql<{ variant_id: string }>(`select variant_id from public.batches where id = $1`, [
      seed.id,
    ]);
    variantId = variant_id;
    await sql(`delete from public.batches where id = $1`, [seed.id]);
    await sql(
      `insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, initial_units, unit_purchase_price, stack_number)
       select '${BATCH_TAG}' || lpad(n::text, 5, '0'), $1, $2, private.ist_today(), 4 + n::numeric / 100, 2, 16, '4FT', 10, 1400, n::text
       from generate_series(1, ${BATCH_COUNT}) n`,
      [variantId, supplierId],
    );
  });

  afterAll(async () => {
    await cleanup();
    if (variantId) await sql(`delete from public.variants where id = $1`, [variantId]);
    if (productId) await sql(`delete from public.products where id = $1`, [productId]);
    if (supplierId) await sql(`delete from public.suppliers where id = $1`, [supplierId]);
  });

  it("the customers list reads every row and the type split is complete", async () => {
    const customers = await readCustomerList(operator);
    const mine = customers.filter((c) => c.name?.startsWith(CUSTOMER_TAG));
    expect(customers.length).toBeGreaterThanOrEqual(CUSTOMER_COUNT);
    expect(mine).toHaveLength(CUSTOMER_COUNT);
    expect(new Set(mine.map((c) => c.id)).size).toBe(CUSTOMER_COUNT);
    expect(mine.filter((c) => c.customer_type === "CONTRACTOR")).toHaveLength(300);
    expect(mine.filter((c) => c.customer_type === "TRUST")).toHaveLength(300);
  });

  it("the customer picker and palette reads include a customer sorted after the 1,000th", async () => {
    const options = await readCustomerOptions(operator);
    expect(options.length).toBeGreaterThan(1000);
    expect(options.some((c) => c.name === `${CUSTOMER_TAG} ${CUSTOMER_COUNT}`)).toBe(true);
    expect(options.at(-1)?.name).toBe(`${CUSTOMER_TAG} ${CUSTOMER_COUNT}`);
  });

  it("the yard read includes every batch past the 1,000th", async () => {
    const batches = await readYardBatches(operator);
    const mine = batches.filter((b) => b.batch_code?.startsWith(BATCH_TAG));
    expect(batches.length).toBeGreaterThan(1000);
    expect(mine).toHaveLength(BATCH_COUNT);
    expect(new Set(mine.map((b) => b.id)).size).toBe(BATCH_COUNT);
  });

  it("the stock line read pages without repeating or skipping a line", async () => {
    const lines = await readStockLines(operator);
    expect(new Set(lines.map((l) => l.line_key)).size).toBe(lines.length);
    expect(lines.length).toBeGreaterThan(1000);
    expect(lines.filter((l) => l.product_name === productName)).toHaveLength(BATCH_COUNT);
  });

  it("the duplicate phone check finds a phone held beyond the first 1,000 customers", async () => {
    const [{ phone, id }] = await sql<{ phone: string; id: string }>(
      `select phone, id from public.customers where name like '${CUSTOMER_TAG}%' order by id offset 1300 limit 1`,
    );
    const rankBefore = await sql<{ n: string }>(`select count(*) n from public.customers where id < $1`, [id]);
    expect(Number(rankBefore[0]?.n)).toBeGreaterThan(1000);
    const found = await findCustomerByPhone(operator, phone);
    expect(found?.id).toBe(id);
    expect(await findCustomerByPhone(operator, "+91 9999999998")).toBeNull();
  });

  it("createCustomerAction returns the existing customer for a phone held beyond the first 1,000 rows", async () => {
    const [{ phone, id }] = await sql<{ phone: string; id: string }>(
      `select phone, id from public.customers where name like '${CUSTOMER_TAG}%' order by id offset 1400 limit 1`,
    );
    server.client = operator;
    const result = await createCustomerAction({ name: "ZZPG Duplicate", phone, customerType: "REGULAR" });
    expect(result.ok && result.data.id).toBe(id);
    expect(result.ok && result.data.existed).toBe(true);
    const { count } = await operator
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("name", "ZZPG Duplicate");
    expect(count).toBe(0);
  });

  it("createCustomerAction returns a failure when the phone check cannot read", async () => {
    const failing = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "order", "not"]) chain[method] = () => chain;
        chain.range = () => Promise.resolve({ data: null, error: { message: "canceling statement due to timeout" } });
        return chain;
      },
    };
    server.client = failing;
    const result = await createCustomerAction({
      name: "ZZPG Duplicate",
      phone: "+91 90000 00001",
      customerType: "REGULAR",
    });
    expect(result).toEqual({ ok: false, error: "canceling statement due to timeout" });
  });
});
