import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { roleLabel } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { AdminLists } from "./admin-lists";
import { InventoryRules } from "./inventory-rules";
import { TeamAccess } from "./team-access";

export default async function SettingsPage() {
  const session = await getSession();
  const member = session.status === "member" ? session.member : null;
  const isAdmin = member?.role === "ADMIN";
  const supabase = await createClient();
  const empty = Promise.resolve({ data: [] });
  const [{ data: team }, { data: settings }, products, variants, suppliers, batchReferences] = await Promise.all([
    isAdmin ? supabase.from("team_members").select("*").order("created_at") : empty,
    supabase.from("settings").select("*").maybeSingle(),
    isAdmin ? supabase.from("products").select("id, name, abbreviation, category").order("name") : empty,
    isAdmin ? supabase.from("variants").select("id, name, product_id").order("name") : empty,
    isAdmin ? supabase.from("suppliers").select("id, name").order("name") : empty,
    isAdmin ? supabase.from("v_batches").select("batch_code, product_id, variant_id, supplier_id") : empty,
  ]);

  return (
    <>
      <PageHeader title="Settings" />

      <section className="rounded-card bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {member?.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{member?.name}</span>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
                  {member ? roleLabel(member.role) : ""}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">{member?.email}</span>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" className="bg-card">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Signed in with Google</p>
      </section>

      {isAdmin ? (
        <>
          <TeamAccess members={team ?? []} currentEmail={member?.email ?? ""} />
          <InventoryRules ageing={settings?.ageing_after_days ?? 90} stale={settings?.stale_after_days ?? 180} />
          <AdminLists
            products={products.data ?? []}
            variants={variants.data ?? []}
            suppliers={suppliers.data ?? []}
            batchReferences={batchReferences.data ?? []}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Team access and inventory rules are managed by an Admin.</p>
      )}
    </>
  );
}
