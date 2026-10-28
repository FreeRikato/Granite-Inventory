import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database, Tables } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;
type RowsResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE_SIZE = 1000;

async function rows<T>(query: RowsResult<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function allRows<T>(
  page: (from: number, to: number) => RowsResult<T>,
  key: (row: T) => string,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const batch = await rows(page(from, from + PAGE_SIZE - 1));
    for (const row of batch) {
      const rowKey = key(row);
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);
      all.push(row);
    }
    if (batch.length < PAGE_SIZE) return all;
  }
}

export function readYardBatches(db: Db) {
  return allRows<Tables<"v_yard_batches">>(
    (from, to) => db.from("v_yard_batches").select("*").order("id").range(from, to),
    (row) => row.id ?? "",
  );
}

export function readStockLines(db: Db) {
  return allRows<Tables<"v_stock_lines">>(
    (from, to) =>
      db.from("v_stock_lines").select("*").gt("available", 0).order("product_name").order("line_key").range(from, to),
    (row) => row.line_key ?? "",
  );
}

export type CustomerOption = Pick<Tables<"customers">, "id" | "name" | "phone" | "customer_type" | "is_walk_in">;

export function readCustomerOptions(db: Db) {
  return allRows<CustomerOption>(
    (from, to) =>
      db
        .from("customers")
        .select("id, name, phone, customer_type, is_walk_in")
        .order("name")
        .order("id")
        .range(from, to),
    (row) => row.id,
  );
}

function readCustomersWithPhone(db: Db) {
  return allRows<Tables<"customers">>(
    (from, to) => db.from("customers").select("*").not("phone", "is", null).order("id").range(from, to),
    (row) => row.id,
  );
}

export async function findCustomerByPhone(db: Db, phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const withPhone = await readCustomersWithPhone(db);
  return withPhone.find((c) => (c.phone ?? "").replace(/\D/g, "").slice(-10) === digits) ?? null;
}

export function readCustomerList(db: Db) {
  return allRows<Tables<"v_customers">>(
    (from, to) => db.from("v_customers").select("*").order("name").order("id").range(from, to),
    (row) => row.id ?? "",
  );
}

type ProductOption = Pick<Tables<"products">, "id" | "name" | "abbreviation" | "category" | "archived_at">;

export function readProducts(db: Db) {
  return allRows<ProductOption>(
    (from, to) =>
      db
        .from("products")
        .select("id, name, abbreviation, category, archived_at")
        .order("name")
        .order("id")
        .range(from, to),
    (row) => row.id,
  );
}

export function readSuppliers(db: Db) {
  return allRows<Pick<Tables<"suppliers">, "id" | "name" | "phone" | "archived_at">>(
    (from, to) => db.from("suppliers").select("id, name, phone, archived_at").order("name").order("id").range(from, to),
    (row) => row.id,
  );
}

export const yardBatchesQuery = queryOptions({
  queryKey: ["yard-batches"],
  queryFn: () => readYardBatches(createClient()),
});

export const stockLinesQuery = queryOptions({
  queryKey: ["stock-lines"],
  queryFn: () => readStockLines(createClient()),
});

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => readCustomerOptions(createClient()),
});

export const recentStacksQuery = queryOptions({
  queryKey: ["recent-stacks"],
  queryFn: () =>
    rows<Pick<Tables<"v_recent_stacks">, "slot" | "stack_number">>(
      createClient()
        .from("v_recent_stacks")
        .select("slot, stack_number")
        .order("last_used_at", { ascending: false })
        .limit(20),
    ),
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => readProducts(createClient()),
});

export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: () => readSuppliers(createClient()),
});

export const customerListQuery = queryOptions({
  queryKey: ["customer-list"],
  queryFn: () => readCustomerList(createClient()),
});

export const recentBatchesQuery = (includeArchived: boolean) =>
  queryOptions({
    queryKey: ["recent-batches", includeArchived],
    queryFn: () => {
      const query = createClient().from("v_batches").select("*");
      return rows<Tables<"v_batches">>(
        (includeArchived ? query : query.is("archived_at", null)).order("created_at", { ascending: false }).limit(8),
      );
    },
  });

export const dashboardKpisQuery = queryOptions({
  queryKey: ["dashboard-kpis"],
  queryFn: async (): Promise<Tables<"v_dashboard_kpis"> | null> => {
    const { data, error } = await createClient().from("v_dashboard_kpis").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
});

export const fastMovingQuery = queryOptions({
  queryKey: ["fast-moving", 90, 5],
  queryFn: () => rows<{ label: string; units: number }>(createClient().rpc("fast_moving", { p_days: 90, p_limit: 5 })),
});

export const staleAfterDaysQuery = queryOptions({
  queryKey: ["stale-after-days"],
  queryFn: async (): Promise<number> => {
    const { data, error } = await createClient().from("settings").select("stale_after_days").maybeSingle();
    if (error) throw new Error(error.message);
    return data?.stale_after_days ?? 180;
  },
});
