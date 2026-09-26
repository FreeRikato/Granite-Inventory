import { notFound } from "next/navigation";
import { CatalogView } from "./catalog-view";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Stock catalog" };

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data: business } = await supabase.from("v_public_business").select("*").maybeSingle();
  if (!business?.catalog_public) notFound();
  const { data: lines } = await supabase.from("v_public_catalog").select("*").order("product_name").order("variant_name");

  return (
    <CatalogView
      businessName={business.business_name ?? "Stock catalog"}
      tagline={business.tagline ?? ""}
      whatsappNumber={business.whatsapp_number ?? ""}
      lines={lines ?? []}
    />
  );
}
