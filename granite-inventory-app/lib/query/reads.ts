import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

/* Browser-side reads for the app's pages. Each is one PostgREST call with the user's JWT, so RLS
   decides what comes back exactly as it does on the server. Overview, Yard and Sell share the
   batches query, so visiting one warms the others. */

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const yardBatchesQuery = queryOptions({
  queryKey: ["yard-batches"],
  queryFn: () => rows<Tables<"v_yard_batches">>(createClient().from("v_yard_batches").select("*")),
});

export const stockLinesQuery = queryOptions({
  queryKey: ["stock-lines"],
  queryFn: () => rows<Tables<"v_stock_lines">>(createClient().from("v_stock_lines").select("*").gt("available", 0).order("product_name")),
});

export type CustomerOption = Pick<Tables<"customers">, "id" | "name" | "phone" | "customer_type" | "is_walk_in">;

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => rows<CustomerOption>(createClient().from("customers").select("id, name, phone, customer_type, is_walk_in").order("name")),
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () =>
    rows<Pick<Tables<"products">, "id" | "name" | "abbreviation" | "category">>(
      createClient().from("products").select("id, name, abbreviation, category").order("name"),
    ),
});

export const variantsQuery = queryOptions({
  queryKey: ["variants"],
  queryFn: () => rows<Pick<Tables<"variants">, "id" | "product_id" | "name">>(createClient().from("variants").select("id, product_id, name").order("name")),
});

export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: () => rows<Pick<Tables<"suppliers">, "id" | "name">>(createClient().from("suppliers").select("id, name").order("name")),
});

export const customerListQuery = queryOptions({
  queryKey: ["customer-list"],
  queryFn: () => rows<Tables<"v_customers">>(createClient().from("v_customers").select("*").order("name")),
});

export const recentBatchesQuery = queryOptions({
  queryKey: ["recent-batches"],
  queryFn: () => rows<Tables<"v_batches">>(createClient().from("v_batches").select("*").order("created_at", { ascending: false }).limit(8)),
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
