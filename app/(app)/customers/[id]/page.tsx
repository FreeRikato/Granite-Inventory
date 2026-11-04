import { notFound } from "next/navigation";
import { CustomerTypeBadge, initialsOf } from "@/components/customer-type-badge";
import { getSession } from "@/lib/auth";
import { formatRupees, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { CommandPalette } from "@/components/shell/command-palette";
import { ViewReady } from "@/components/view-state";
import { rowStateClass } from "@/lib/query/row-style";
import { CustomerActions } from "./customer-actions";
import { billContext } from "@/lib/bill-context";
import { type SaleEditLists } from "./sale-actions";
import { SalesTable } from "./sales-rows";

export default async function CustomerPage(props: PageProps<"/customers/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const [{ data: customer }, { data: sales }, { data: paid }, { data: credit }, { data: receipts }, session] =
    await Promise.all([
      supabase.from("v_customers").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("v_sales")
        .select("*")
        .eq("customer_id", id)
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("bill_payments")
        .select("bill_id, payment_mode, amount, bills!inner(customer_id)")
        .eq("bills.customer_id", id)
        .order("payment_mode"),
      supabase.from("v_credit").select("*").eq("customer_id", id),
      supabase
        .from("credit_payments")
        .select("id, bill_id, paid_on, credit_payment_lines(payment_mode, amount), bills!inner(customer_id)")
        .eq("bills.customer_id", id)
        .order("paid_on")
        .order("created_at"),
      getSession(),
    ]);
  if (!customer) notFound();
  const { billPayments, creditRows, laterPayments } = billContext({
    sales: sales ?? [],
    paid: paid ?? [],
    credit: credit ?? [],
    receipts: receipts ?? [],
  });
  const isAdmin = session.status === "member" && session.member.role === "ADMIN";
  const editLists: SaleEditLists | null = isAdmin
    ? {
        batches:
          (
            await supabase
              .from("v_yard_batches")
              .select(
                "id, batch_code, line_key, available, purchase_date, product_name, length_ft, breadth_ft, thickness_mm, archived_at",
              )
              .order("purchase_date")
          ).data ?? [],
        customers: (await supabase.from("customers").select("id, name, phone").order("name")).data ?? [],
      }
    : null;

  return (
    <ViewReady>
      <div className={`flex flex-wrap items-start justify-between gap-4 ${rowStateClass}`}>
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
            customer={{
              id: customer.id ?? id,
              name: customer.name ?? "",
              phone: customer.phone,
              customer_type: customer.customer_type ?? "REGULAR",
              is_walk_in: customer.is_walk_in ?? false,
            }}
            canDelete={isAdmin && !customer.is_walk_in && (customer.sale_count ?? 0) === 0}
          />
        </div>
      </div>

      <dl className="flex flex-wrap divide-x divide-border">
        <Kpi label="Sales" value={String(customer.sale_count ?? 0)} />
        <Kpi label="Lifetime revenue" value={formatRupees(customer.lifetime_revenue ?? 0)} />
        <Kpi
          label="Last purchase"
          value={customer.last_purchase_date ? relativeDays(customer.last_purchase_date) : "No purchases"}
        />
        <Kpi
          label="Balance"
          value={formatRupees(customer.owed ?? 0)}
          className="max-sm:basis-full max-sm:border-l-0 max-sm:pt-4 max-sm:pl-0"
        />
      </dl>

      <section className="rounded-card bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Sales</h2>
        {!sales || sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No sales recorded for this customer.</p>
        ) : (
          <SalesTable
            sales={sales}
            editLists={editLists}
            billPayments={billPayments}
            credit={creditRows}
            laterPayments={laterPayments}
          />
        )}
      </section>
    </ViewReady>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 pr-6 pl-6 first:pl-0", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular">{value}</dd>
    </div>
  );
}
