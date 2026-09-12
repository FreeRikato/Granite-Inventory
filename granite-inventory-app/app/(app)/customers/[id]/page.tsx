import { notFound } from "next/navigation";
import { CustomerTypeBadge, initialsOf } from "@/components/customer-type-badge";
import { getSession } from "@/lib/auth";
import { formatDate, formatRupees, formatSize, relativeDays } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/shell/command-palette";
import { CustomerActions } from "./customer-actions";
import { SaleActions, type SaleEditLists } from "./sale-actions";

export default async function CustomerPage(props: PageProps<"/customers/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const [{ data: customer }, { data: sales }, session] = await Promise.all([
    supabase.from("v_customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_sales").select("*").eq("customer_id", id).order("sale_date", { ascending: false }).order("created_at", { ascending: false }),
    getSession(),
  ]);
  if (!customer) notFound();
  const isAdmin = session.status === "member" && session.member.role === "ADMIN";
  const editLists: SaleEditLists | null = isAdmin
    ? {
        batches: (await supabase.from("v_yard_batches").select("id, batch_code, line_key, available, purchase_date, product_name, variant_name, length_ft, breadth_ft, thickness_mm").order("purchase_date")).data ?? [],
        customers: (await supabase.from("customers").select("id, name, phone").order("name")).data ?? [],
      }
    : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
            {initialsOf(customer.name ?? "")}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">{customer.phone ?? "No phone on file"}</p>
          </div>
          <CustomerTypeBadge type={customer.customer_type} />
        </div>
        <div className="flex items-center gap-2">
          <CommandPalette />
          <CustomerActions
          customer={{ id: customer.id ?? id, name: customer.name ?? "", phone: customer.phone, customer_type: customer.customer_type ?? "REGULAR", is_walk_in: customer.is_walk_in ?? false }}
          canDelete={isAdmin && !customer.is_walk_in && (customer.sale_count ?? 0) === 0}
          />
        </div>
      </div>

      <dl className="flex divide-x divide-border">
        <Kpi label="Sales" value={String(customer.sale_count ?? 0)} />
        <Kpi label="Lifetime revenue" value={formatRupees(customer.lifetime_revenue ?? 0)} />
        <Kpi label="Last purchase" value={customer.last_purchase_date ? relativeDays(customer.last_purchase_date) : "No purchases"} />
      </dl>

      <section className="rounded-card bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Sales</h2>
        {!sales || sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No sales recorded for this customer.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="block w-full text-sm sm:table">
              <thead className="hidden text-left text-xs text-muted-foreground sm:table-header-group">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Stone</th>
                  <th className="py-2 pr-4 font-medium">Batch</th>
                  <th className="py-2 pr-4 text-right font-medium">Qty</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">Margin</th>
                  {editLists ? <th className="py-2 pl-4"><span className="sr-only">Sale actions</span></th> : null}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {sales.map((s) => (
                  <tr key={s.id} className="block border-t border-border py-2.5 sm:table-row sm:py-0" data-testid="sale-row">
                    <td className="block py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pr-4 sm:whitespace-nowrap">
                      <MobileLabel>Date</MobileLabel>
                      {s.sale_date ? formatDate(s.sale_date) : ""}
                    </td>
                    <td className="block py-1.5 pr-0 font-medium sm:table-cell sm:py-2.5 sm:pr-4">
                      <MobileLabel>Stone</MobileLabel>
                      {s.product_name} · {s.variant_name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatSize({ length_ft: s.length_ft, breadth_ft: s.breadth_ft, thickness_mm: s.thickness_mm })}
                        {s.has_stickering ? " · with stickering" : ""}
                      </span>
                    </td>
                    <td className="block py-1.5 pr-0 font-mono text-xs sm:table-cell sm:py-2.5 sm:pr-4">
                      <MobileLabel className="font-sans">Batch</MobileLabel>
                      {s.batch_code}
                    </td>
                    <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
                      <MobileLabel className="font-sans">Qty</MobileLabel>
                      {s.quantity}
                    </td>
                    <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:pr-4 sm:text-right">
                      <MobileLabel className="font-sans">Total</MobileLabel>
                      {formatRupees(s.revenue ?? 0)}
                    </td>
                    <td className="block py-1.5 pr-0 tabular sm:table-cell sm:py-2.5 sm:text-right">
                      <MobileLabel className="font-sans">Margin</MobileLabel>
                      {formatRupees(s.margin ?? 0)}
                      {s.margin_pct !== null ? <span className="ml-1 text-xs text-muted-foreground">({s.margin_pct}%)</span> : null}
                    </td>
                    {editLists ? (
                      <td className="flex items-center gap-2 py-1.5 pr-0 sm:table-cell sm:py-2.5 sm:pl-4">
                        <MobileLabel>Actions</MobileLabel>
                        <SaleActions sale={s} lists={editLists} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function MobileLabel({ children, className }: { children: string; className?: string }) {
  return <span className={cn("mr-2 text-xs font-medium text-muted-foreground sm:hidden", className)}>{children}</span>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 pr-6 pl-6 first:pl-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular">{value}</dd>
    </div>
  );
}
