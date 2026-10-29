"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type BarShapeProps, type TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatPercent, formatRupees, formatRupeesAxis } from "@/lib/format";

export type MarginGrain = "week" | "month";

export type MarginPeriod = {
  readonly period_start: string;
  readonly revenue: number;
  readonly margin: number;
  readonly margin_pct: number | null;
};

const config = { margin: { label: "Margin", color: "var(--chart-1)" } } satisfies ChartConfig;

const STUB_HEIGHT = 2;

function axisLabel(grain: MarginGrain, periodStart: string): string {
  return format(parseISO(periodStart), grain === "week" ? "d MMM" : "MMM");
}

function periodTitle(grain: MarginGrain, periodStart: string): string {
  const date = parseISO(periodStart);
  return grain === "week" ? `Week of ${format(date, "d MMM yyyy")}` : format(date, "MMMM yyyy");
}

function barShape(lastIndex: number) {
  return function MarginBar({ x, y, width, height, index }: BarShapeProps) {
    const current = index === lastIndex;
    const drawnHeight = Math.max(Math.abs(height), STUB_HEIGHT);
    const top = height === 0 ? y - STUB_HEIGHT : Math.min(y, y + height);
    return (
      <rect
        data-testid="margin-bar"
        data-current={current}
        x={x}
        y={top}
        width={width}
        height={drawnHeight}
        rx={3}
        fill={current ? "var(--color-margin)" : "var(--chart-5)"}
      />
    );
  };
}

function MarginTooltip({
  rows,
  grain,
  active,
  label,
}: Pick<TooltipContentProps, "active" | "label"> & {
  readonly rows: readonly MarginPeriod[];
  readonly grain: MarginGrain;
}) {
  const row = rows.find((r) => r.period_start === label);
  if (!active || !row) return null;
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <span className="font-semibold">{periodTitle(grain, row.period_start)}</span>
      <span className="flex justify-between gap-6">
        <span className="text-muted-foreground">Margin</span>
        <span className="font-semibold tabular">{formatRupees(row.margin)}</span>
      </span>
      <span className="flex justify-between gap-6">
        <span className="text-muted-foreground">Margin %</span>
        <span className="font-semibold tabular">{row.margin_pct === null ? "-" : formatPercent(row.margin_pct)}</span>
      </span>
      <span className="flex justify-between gap-6">
        <span className="text-muted-foreground">Billed</span>
        <span className="font-semibold tabular">{formatRupees(row.revenue)}</span>
      </span>
    </div>
  );
}

export function MarginBars({ rows, grain }: { readonly rows: readonly MarginPeriod[]; readonly grain: MarginGrain }) {
  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-64 w-full"
      role="group"
      aria-label={`Margin by ${grain}`}
      data-testid="margin-chart"
    >
      <BarChart data={[...rows]} accessibilityLayer margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="period_start"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          tickFormatter={(v: string) => axisLabel(grain, v)}
        />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatRupeesAxis(v)} />
        <ChartTooltip
          cursor={false}
          content={({ active, label }) => <MarginTooltip rows={rows} grain={grain} active={active} label={label} />}
        />
        <Bar dataKey="margin" shape={barShape(rows.length - 1)} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
