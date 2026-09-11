import Link from "next/link";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AgeingBadge } from "@/components/ageing-badge";
import { MovingBars } from "@/components/dashboard/moving-bars";
import { StockDonut } from "@/components/dashboard/stock-donut";
import { PageHeader } from "@/components/shell/page-header";
import { formatNumber, formatPercent, formatRupeesCompact, formatSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function OverviewPage() {
  const supabase = await createClient();
  const [{ data: k }, { data: moving }, { data: stale }, { data: settings }] = await Promise.all([
    supabase.from("v_dashboard_kpis").select("*").single(),
    supabase.rpc("fast_moving", { p_days: 90, p_limit: 5 }),
    supabase.from("v_yard_batches").select("*").eq("ageing_band", "STALE").gt("available", 0).order("purchase_date").limit(4),
    supabase.from("settings").select("stale_after_days").maybeSingle(),
  ]);

  const active = k?.active_stock ?? 0;
  const lastMonth = k?.active_stock_last_month_end ?? 0;
  const change = lastMonth > 0 ? ((active - lastMonth) / lastMonth) * 100 : null;

  return (
    <>
      <PageHeader title="Overview" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="grid gap-6 rounded-card bg-card p-6 shadow-sm sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Active stock</span>
              {change !== null ? (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular", change >= 0 ? "bg-accent text-accent-foreground" : "bg-stale-soft text-stale")} data-testid="stock-change">
                  {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {formatPercent(Math.abs(change))} vs last month
                </span>
              ) : null}
            </div>
            <span className="text-5xl font-bold tracking-tight tabular" data-testid="kpi-active">{formatNumber(active)}</span>
          </div>
          <div className="flex flex-col gap-3 sm:pl-6">
            <span className="text-sm text-muted-foreground">Total inventory value</span>
            <span className="text-5xl font-bold tracking-tight tabular" data-testid="kpi-value">{formatRupeesCompact(k?.inventory_value ?? 0)}</span>
          </div>
        </section>
        <section className="flex flex-col divide-y divide-border rounded-card bg-card px-6 shadow-sm">
          <div className="flex flex-col gap-1 py-5">
            <span className="text-sm text-muted-foreground">MTD Revenue</span>
            <span className="text-2xl font-bold tabular" data-testid="kpi-revenue">{formatRupeesCompact(k?.mtd_revenue ?? 0)}</span>
          </div>
          <div className="flex flex-col gap-1 py-5">
            <span className="text-sm text-muted-foreground">MTD Margin</span>
            <span className="text-2xl font-bold tabular" data-testid="kpi-margin">
              {k?.mtd_margin_pct !== null && k?.mtd_margin_pct !== undefined ? formatPercent(k.mtd_margin_pct) : "0%"}
              <span className="ml-2 text-sm font-medium text-muted-foreground">{formatRupeesCompact(k?.mtd_margin ?? 0)}</span>
            </span>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section className="rounded-card bg-card p-6 shadow-sm">
          <h2 className="text-base font-bold">Stock status</h2>
          <div className="mt-4">
            <StockDonut active={active} sold={k?.units_sold_total ?? 0} />
          </div>
        </section>
        <section className="rounded-card bg-card p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">Fast vs slow moving</h2>
            <span className="text-xs text-muted-foreground">units sold · last 90 days</span>
          </div>
          <div className="mt-4">
            <MovingBars rows={moving ?? []} />
          </div>
        </section>
      </div>

      <section className="rounded-card bg-card p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">Stale stock ({stale?.length ?? 0})</h2>
          <Link href={`/yard?age=stale${stale?.[0]?.slot ? `&slot=${stale[0].slot}` : ""}`} className="text-xs text-muted-foreground hover:text-foreground">
            Batches over {settings?.stale_after_days ?? 180} days · view in yard
          </Link>
        </div>
        {!stale || stale.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing stale. Every batch is under the threshold.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {stale.map((b) => (
              <li key={b.id}>
                <Link href={`/yard?line=${encodeURIComponent(b.line_key ?? "")}&q=${encodeURIComponent(b.batch_code ?? "")}`} className="flex items-center gap-4 py-3 hover:bg-secondary/40" data-testid="stale-row">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stale-soft text-xs font-bold text-stale">
                    {b.product_abbreviation}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{b.product_name} · {b.variant_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.batch_code} · {formatSize({ length_ft: b.length_ft, breadth_ft: b.breadth_ft, thickness_mm: b.thickness_mm })} · {b.available} available
                    </span>
                  </span>
                  <AgeingBadge band={b.ageing_band} days={b.age_days} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
