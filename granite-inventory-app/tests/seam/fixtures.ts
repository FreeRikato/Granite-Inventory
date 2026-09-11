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

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
