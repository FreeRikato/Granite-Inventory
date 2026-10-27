import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

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
  queryFn: () =>
    rows<Tables<"v_stock_lines">>(
      createClient().from("v_stock_lines").select("*").gt("available", 0).order("product_name"),
    ),
});

export type CustomerOption = Pick<Tables<"customers">, "id" | "name" | "phone" | "customer_type" | "is_walk_in">;

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () =>
    rows<CustomerOption>(
      createClient().from("customers").select("id, name, phone, customer_type, is_walk_in").order("name"),
    ),
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
  queryFn: () =>
    rows<Pick<Tables<"products">, "id" | "name" | "abbreviation" | "category" | "archived_at">>(
      createClient().from("products").select("id, name, abbreviation, category, archived_at").order("name"),
    ),
});

export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: () =>
    rows<Pick<Tables<"suppliers">, "id" | "name" | "phone" | "archived_at">>(
      createClient().from("suppliers").select("id, name, phone, archived_at").order("name"),
    ),
});

export const customerListQuery = queryOptions({
  queryKey: ["customer-list"],
  queryFn: () => rows<Tables<"v_customers">>(createClient().from("v_customers").select("*").order("name")),
});

export const recentBatchesQuery = queryOptions({
  queryKey: ["recent-batches"],
  queryFn: () =>
    rows<Tables<"v_batches">>(
      createClient()
        .from("v_batches")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(8),
    ),
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
