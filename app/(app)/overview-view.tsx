"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AgeingBadge } from "@/components/ageing-badge";
import { DataAge } from "@/components/data-age";
import { MovingBars } from "@/components/dashboard/moving-bars";
import { StockDonut } from "@/components/dashboard/stock-donut";
import { ViewError, ViewSkeleton } from "@/components/view-state";
import { formatNumber, formatPercent, formatRupeesCompact, formatSize } from "@/lib/format";
import { useHydrated } from "@/lib/query/provider";
import { dashboardKpisQuery, fastMovingQuery, staleAfterDaysQuery, yardBatchesQuery } from "@/lib/query/reads";
import { cn } from "@/lib/utils";

const STALE_ROWS = 4;

export function OverviewView() {
  const hydrated = useHydrated();
  const kpis = useQuery(dashboardKpisQuery);
  const moving = useQuery(fastMovingQuery);
  const batches = useQuery(yardBatchesQuery);
  const staleAfter = useQuery(staleAfterDaysQuery);

  if (!hydrated || !kpis.isSuccess || !moving.isSuccess || !batches.isSuccess) {
    const failed = [kpis, moving, batches].find((q) => q.isError);
    if (failed?.isError) return <ViewError what="the overview" message={failed.error.message} />;
    return <ViewSkeleton />;
  }

  const k = kpis.data;
  /* The stale panel is a slice of the shared batches query: oldest stale batches with stock. */
  const stale = batches.data
    .filter((b) => b.ageing_band === "STALE" && (b.available ?? 0) > 0)
    .sort((a, b) => (a.purchase_date ?? "").localeCompare(b.purchase_date ?? ""))
    .slice(0, STALE_ROWS);
  const fetching = kpis.isFetching || moving.isFetching || batches.isFetching;
  const updatedAt = Math.min(kpis.dataUpdatedAt, moving.dataUpdatedAt, batches.dataUpdatedAt);

  const active = k?.active_stock ?? 0;
  const lastMonth = k?.active_stock_last_month_end ?? 0;
  const change = lastMonth > 0 ? ((active - lastMonth) / lastMonth) * 100 : null;

  return (
    <>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={updatedAt} fetching={fetching} />
      </div>
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
            <MovingBars rows={moving.data} />
          </div>
        </section>
      </div>

      <section className="rounded-card bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Stale stock ({stale.length})</h2>
          <Link href={`/yard?age=stale${stale?.[0]?.slot ? `&slot=${stale[0].slot}` : ""}`} className="text-xs text-muted-foreground hover:text-foreground">
            Batches over {staleAfter.data ?? 180} days · view in yard
          </Link>
        </div>
        {stale.length === 0 ? (
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
