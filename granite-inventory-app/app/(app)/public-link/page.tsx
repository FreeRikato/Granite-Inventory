import { headers } from "next/headers";
import { StoneTile } from "@/components/catalog/stone-tile";
import { PageHeader } from "@/components/shell/page-header";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PublicLinkControls } from "./public-link-controls";

export default async function PublicLinkPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: lines }, session, h] = await Promise.all([
    supabase.from("settings").select("catalog_public, whatsapp_number, business_name").maybeSingle(),
    supabase.from("v_stock_lines").select("*").gt("available", 0).order("available", { ascending: false }),
    getSession(),
    headers(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const url = `${proto}://${host}/catalog`;
  const isAdmin = session.status === "member" && session.member.role === "ADMIN";
  const preview = (lines ?? []).slice(0, 3);
  const more = Math.max(0, (lines ?? []).length - preview.length);

  return (
    <>
      <PageHeader title="Public View Link" />
      <PublicLinkControls
        url={url}
        catalogPublic={settings?.catalog_public ?? false}
        whatsappNumber={settings?.whatsapp_number ?? ""}
        businessName={settings?.business_name ?? ""}
        canEdit={isAdmin}
      />
      <section className="rounded-card bg-card p-6 shadow-sm">
        <h2 className="text-base font-bold">Public preview</h2>
        <p className="mt-1 text-sm italic text-muted-foreground">
          Prices, margins, supplier names and purchase dates stay hidden here. Only product, dimensions and availability are shown.
        </p>
        {preview.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing in stock to show yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {preview.map((l) => (
              <StoneTile key={l.line_key} line={l} compact />
            ))}
            {more > 0 ? (
              <a href="/catalog" target="_blank" className="flex flex-col items-center justify-center rounded-card border border-dashed border-border p-4 text-center text-sm">
                <span className="font-semibold">+{more} more in stock</span>
                <span className="text-xs text-muted-foreground">View full catalog</span>
              </a>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
