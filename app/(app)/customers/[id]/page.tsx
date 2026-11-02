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
import { isPaymentMode } from "@/lib/domain";
import { toCreditRow } from "@/lib/query/reads";
import { type BillPayments, type SaleEditLists } from "./sale-actions";
import { SalesRows, type LaterPayment } from "./sales-rows";

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
  const billTotals = new Map<string, number>();
  for (const sale of sales ?? []) {
    if (sale.bill_id) billTotals.set(sale.bill_id, (billTotals.get(sale.bill_id) ?? 0) + (sale.revenue ?? 0));
  }
  const creditRows = new Map((credit ?? []).map((row) => [row.bill_id ?? "", toCreditRow(row)]));
  const billPayments: Record<string, BillPayments> = {};
  for (const p of paid ?? []) {
    if (!isPaymentMode(p.payment_mode)) continue;
    const bill = billPayments[p.bill_id] ?? {
      total: billTotals.get(p.bill_id) ?? 0,
      onCredit: creditRows.has(p.bill_id),
      laterTotal: 0,
      payments: [],
    };
    billPayments[p.bill_id] = {
      ...bill,
      payments: [...bill.payments, { paymentMode: p.payment_mode, amount: p.amount }],
    };
  }
  for (const [billId, row] of creditRows) {
    billPayments[billId] ??= { total: row.total, onCredit: true, laterTotal: 0, payments: [] };
  }
  const laterPayments: Record<string, LaterPayment[]> = {};
  for (const r of receipts ?? []) {
    const lines = r.credit_payment_lines.flatMap((l) =>
      isPaymentMode(l.payment_mode) ? [{ paymentMode: l.payment_mode, amount: l.amount }] : [],
    );
    const known = billPayments[r.bill_id];
    if (known) {
      billPayments[r.bill_id] = { ...known, laterTotal: known.laterTotal + lines.reduce((t, l) => t + l.amount, 0) };
    }
    laterPayments[r.bill_id] = [...(laterPayments[r.bill_id] ?? []), { id: r.id, paidOn: r.paid_on, lines }];
  }
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
                  {editLists ? (
                    <th className="py-2 pl-4">
                      <span className="sr-only">Sale actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                <SalesRows
                  sales={sales}
                  editLists={editLists}
                  billPayments={billPayments}
                  credit={creditRows}
                  laterPayments={laterPayments}
                />
              </tbody>
            </table>
          </div>
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
