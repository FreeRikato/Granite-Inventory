import { PageHeader } from "@/components/shell/page-header";
import { createClient } from "@/lib/supabase/server";
import { SellForm } from "./sell-form";

export default async function SellPage(props: PageProps<"/sell">) {
  const sp = await props.searchParams;
  const preselect = typeof sp.batch === "string" ? sp.batch : null;
  const supabase = await createClient();
  const [customers, lines, batches] = await Promise.all([
    supabase.from("customers").select("id, name, phone, customer_type, is_walk_in").order("name"),
    supabase.from("v_stock_lines").select("*").gt("available", 0).order("product_name"),
    supabase.from("v_yard_batches").select("*").gt("available", 0).order("purchase_date").order("created_at"),
  ]);

  return (
    <>
      <PageHeader title="Sell Stone" />
      <SellForm
        customers={customers.data ?? []}
        lines={lines.data ?? []}
        batches={batches.data ?? []}
        preselectBatchId={preselect}
      />
    </>
  );
}
