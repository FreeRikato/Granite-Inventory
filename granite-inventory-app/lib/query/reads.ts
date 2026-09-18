import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

/* Browser-side reads for the pages people bounce between during a sale. Each is one PostgREST
   call with the user's JWT, so RLS decides what comes back exactly as it does on the server.
   Yard and Sell share the batches query, so visiting one warms the other. */

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
  queryFn: () => rows<Pick<Tables<"products">, "id" | "name" | "category">>(createClient().from("products").select("id, name, category").order("name")),
});

export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: () => rows<Pick<Tables<"suppliers">, "id" | "name">>(createClient().from("suppliers").select("id, name").order("name")),
});
