import { PageHeader } from "@/components/shell/page-header";
import { Notice } from "@/components/notice";
import { createClient } from "@/lib/supabase/server";
import { InwardForm } from "./inward-form";
import { RecentBatches } from "./recent-batches";

export default async function InwardPage() {
  const supabase = await createClient();
  const [products, variants, suppliers, recent] = await Promise.all([
    supabase.from("products").select("id, name, abbreviation, category").order("name"),
    supabase.from("variants").select("id, product_id, name").order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase.from("v_batches").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  return (
    <>
      <PageHeader title="Inward Stock" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <InwardForm
          products={products.data ?? []}
          variants={variants.data ?? []}
          suppliers={suppliers.data ?? []}
        />
        <Notice className="h-fit">
          Batches are never merged. Every purchase becomes its own tracked lot, even if it&apos;s
          the same product and size as existing stock.
        </Notice>
      </div>
      <RecentBatches batches={recent.data ?? []} />
    </>
  );
}
