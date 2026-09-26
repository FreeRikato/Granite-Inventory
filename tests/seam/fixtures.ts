import type { Db } from "./harness";

/* Small domain builders used across suites. Each returns ids for the next call. */

export async function createProduct(
  db: Db,
  input: { name: string; abbreviation: string; category?: "GRANITE" | "MEMORIAL" | "TILES" },
): Promise<string> {
  const { data, error } = await db
    .from("products")
    .insert({ name: input.name, abbreviation: input.abbreviation, category: input.category ?? "GRANITE" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function createSupplier(db: Db, name: string): Promise<string> {
  const { data, error } = await db.from("suppliers").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

export type BatchInput = {
  productId: string;
  supplierId: string;
  variantName?: string;
  purchaseDate?: string;
  length?: number | null;
  breadth?: number | null;
  thickness?: number | null;
  slot?: string | null;
  units?: number;
  unitPrice?: number;
  freight?: number;
};

export function createBatch(db: Db, input: BatchInput) {
  const memorial = input.length === null;
  return db.rpc("create_batch", {
    p_product_id: input.productId,
    p_variant_name: input.variantName ?? "Grade 1",
    p_supplier_id: input.supplierId,
    p_purchase_date: input.purchaseDate ?? today(),
    p_length_ft: memorial ? undefined : (input.length ?? 4),
    p_breadth_ft: memorial ? undefined : (input.breadth ?? 2),
    p_thickness_mm: memorial ? undefined : (input.thickness ?? 16),
    p_slot: input.slot ?? undefined,
    p_initial_units: input.units ?? 10,
    p_unit_purchase_price: input.unitPrice ?? 1400,
    p_freight_cost: input.freight ?? 0,
  });
}

/* Age, "this month" and every date rule in the app come from private.ist_today(), so the
   fixtures have to speak the same calendar. The runner and Postgres are both UTC, which is a
   day behind India between 18:30 and midnight UTC; dates built from the UTC clock would make
   every asserted age one larger for those five and a half hours. India has no DST, so a fixed
   offset is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function today(): string {
  return daysAgo(0);
}

export function daysAgo(days: number): string {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function createCustomer(
  db: Db,
  input: { name: string; phone?: string; type?: "REGULAR" | "CONTRACTOR" | "ENGINEER" | "TRUST" | "RETAIL" },
): Promise<string> {
  const { data, error } = await db
    .from("customers")
    .insert({ name: input.name, phone: input.phone ?? null, customer_type: input.type ?? "REGULAR" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export type SaleInput = {
  batchId: string;
  customerId: string;
  saleDate?: string;
  quantity?: number;
  salePrice?: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER";
  stickering?: { cost: number; price: number };
  misc?: number;
};

export function recordSale(db: Db, input: SaleInput) {
  return db.rpc("record_sale", {
    p_batch_id: input.batchId,
    p_customer_id: input.customerId,
    p_sale_date: input.saleDate ?? today(),
    p_quantity: input.quantity ?? 1,
    p_sale_price: input.salePrice ?? 1650,
    p_payment_mode: input.paymentMode ?? "CASH",
    p_has_stickering: input.stickering !== undefined,
    p_stickering_cost: input.stickering?.cost ?? 0,
    p_stickering_price: input.stickering?.price ?? 0,
    p_misc_expense: input.misc ?? 0,
  });
}
