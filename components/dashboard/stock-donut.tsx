"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";

const config = {
  active: { label: "Active stock", color: "var(--chart-1)" },
  sold: { label: "Sold to date", color: "var(--chart-5)" },
} satisfies ChartConfig;

type Slice = { readonly key: string; readonly value: number; readonly fill: string };

const EMPTY_RING: readonly Slice[] = [{ key: "sold", value: 1, fill: "var(--color-sold)" }];

export function DonutRing({ config, data }: { readonly config: ChartConfig; readonly data: readonly Slice[] }) {
  return (
    <ChartContainer config={config} className="aspect-square h-[150px] w-[150px]">
      <PieChart>
        <Pie
          data={[...data]}
          dataKey="value"
          nameKey="key"
          innerRadius={52}
          outerRadius={72}
          startAngle={90}
          endAngle={-270}
          strokeWidth={2}
          stroke="var(--card)"
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

export function StockDonut({ active, sold }: { readonly active: number; readonly sold: number }) {
  const total = active + sold;
  const pct = total === 0 ? 0 : Math.round((active / total) * 100);
  const data = [
    { key: "active", value: active, fill: "var(--color-active)" },
    { key: "sold", value: sold, fill: "var(--color-sold)" },
  ];

  return (
    <div className="flex items-center gap-6">
      <div className="relative size-[150px] shrink-0">
        <DonutRing config={config} data={total === 0 ? EMPTY_RING : data} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular" data-testid="active-pct">
            {pct}%
          </span>
          <span className="text-xs text-muted-foreground">active</span>
        </div>
      </div>
      <dl className="flex flex-col gap-4 text-sm">
        <Legend color="var(--chart-1)" label="Active stock" value={`${formatNumber(active)} pcs`} />
        <Legend color="var(--chart-5)" label="Sold to date" value={`${formatNumber(sold)} pcs`} />
      </dl>
    </div>
  );
}

export function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10px_1fr] gap-x-2.5">
      <span className="row-span-2 mt-1.5 size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-[15px] font-bold tabular">{value}</dd>
    </div>
  );
}
