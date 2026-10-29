"use client";

import { Fragment, useContext, type ReactNode } from "react";
import { Bar, BarChart as RBarChart, CartesianGrid, Line, LineChart as RLineChart, XAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { RankedBarList } from "@/components/dashboard/moving-bars";
import { DonutRing, Legend } from "@/components/dashboard/stock-donut";
import { formatNumber, formatRupeesCompact } from "@/lib/format";
import { AnswerStreamingContext } from "./answer-streaming";
import { useDealias } from "./use-dealias";
import type { LeafProps, Renderers } from "./define";

const MAX_TABLE_ROWS = 50;
const MAX_SERIES = 4;
const MAX_SLICES = 5;
const palette = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

function seriesChart(props: LeafProps<"BarChart">, dealias: (text: string) => string) {
  const kept = props.series.slice(0, MAX_SERIES);
  const config: ChartConfig = {};
  kept.forEach((s, i) => {
    config[`s${i}`] = { label: dealias(s.name), color: palette[i] };
  });
  const data = props.labels.map((label, row) => ({
    label: dealias(label),
    ...Object.fromEntries(kept.map((s, i) => [`s${i}`, s.values[row]])),
  }));
  return { config, data, count: kept.length };
}

const MAX_TICK_WORD = 9;
const TICK_LINE_HEIGHT = 14;

function shortWord(word: string): string {
  return word.length > MAX_TICK_WORD ? `${word.slice(0, MAX_TICK_WORD - 1)}…` : word;
}

function WrappedTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const words = (payload?.value ?? "").split(" ");
  return (
    <text x={x} y={y} textAnchor="middle" className="recharts-cartesian-axis-tick-value fill-muted-foreground text-xs">
      {words.map((word, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 12 : TICK_LINE_HEIGHT}>
          {shortWord(word)}
        </tspan>
      ))}
    </text>
  );
}

function SeriesChartSlot({ children }: { readonly children: ReactNode }) {
  if (useContext(AnswerStreamingContext)) return <Skeleton className="aspect-video w-full" />;
  return <div className="animate-in fade-in duration-(--motion-fast)">{children}</div>;
}

function Axes() {
  return (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tick={<WrappedTick />} interval={0} height={48} tickLine={false} axisLine={false} />
      <ChartTooltip content={<ChartTooltipContent />} />
      <ChartLegend content={<ChartLegendContent />} />
    </>
  );
}

export const renderers: Renderers = {
  Stack: ({ props, renderNode }) => (
    <div data-slot="answer-stack" className="flex flex-col gap-4">
      {props.children.map((child, index) => (
        <Fragment key={index}>{renderNode(child)}</Fragment>
      ))}
    </div>
  ),
  Text: ({ props }) => <p className="text-sm">{useDealias()(props.text)}</p>,
  Metric: ({ props }) => {
    const dealias = useDealias();
    return (
      <div className="flex flex-col gap-1 rounded-card bg-card p-4 shadow-sm">
        <span className="text-xs text-muted-foreground">{dealias(props.label)}</span>
        <span className="text-2xl font-bold tabular">
          {props.format === "rupees" ? formatRupeesCompact(props.value) : formatNumber(props.value)}
        </span>
      </div>
    );
  },
  RankedBars: ({ props }) => {
    const dealias = useDealias();
    return <RankedBarList rows={props.rows.map((r) => ({ ...r, label: dealias(r.label) }))} />;
  },
  Donut: ({ props }) => {
    const dealias = useDealias();
    const slices = props.slices.slice(0, MAX_SLICES).map((s, i) => ({ ...s, key: `s${i}`, label: dealias(s.label) }));
    const config: ChartConfig = Object.fromEntries(
      slices.map((s, i) => [s.key, { label: s.label, color: palette[i] }]),
    );
    return (
      <div className="flex items-center gap-6">
        <div className="size-[150px] shrink-0">
          <DonutRing
            config={config}
            data={slices.map((s) => ({ key: s.key, value: s.value, fill: `var(--color-${s.key})` }))}
          />
        </div>
        <dl className="flex flex-col gap-4 text-sm">
          {slices.map((s, i) => (
            <Legend key={s.key} color={palette[i]} label={s.label} value={formatNumber(s.value)} />
          ))}
        </dl>
      </div>
    );
  },
  BarChart: ({ props }) => {
    const { config, data, count } = seriesChart(props, useDealias());
    return (
      <SeriesChartSlot>
        <ChartContainer config={config} className="aspect-video w-full">
          <RBarChart data={data}>
            <Axes />
            {Array.from({ length: count }, (_, i) => (
              <Bar key={i} dataKey={`s${i}`} fill={`var(--color-s${i})`} radius={4} isAnimationActive={false} />
            ))}
          </RBarChart>
        </ChartContainer>
      </SeriesChartSlot>
    );
  },
  LineChart: ({ props }) => {
    const { config, data, count } = seriesChart(props, useDealias());
    return (
      <SeriesChartSlot>
        <ChartContainer config={config} className="aspect-video w-full">
          <RLineChart data={data}>
            <Axes />
            {Array.from({ length: count }, (_, i) => (
              <Line
                key={i}
                dataKey={`s${i}`}
                stroke={`var(--color-s${i})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </RLineChart>
        </ChartContainer>
      </SeriesChartSlot>
    );
  },
  Table: ({ props }) => {
    const dealias = useDealias();
    const shown = props.rows.slice(0, MAX_TABLE_ROWS);
    return (
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {props.columns.map((c, i) => (
                <th key={i} className="py-2 pr-4 font-medium wrap-break-word">
                  {dealias(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="py-2 pr-4 tabular wrap-break-word">
                    {typeof cell === "number" ? formatNumber(cell) : dealias(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {props.rows.length > shown.length ? (
          <p className="pt-2 text-xs text-muted-foreground">
            Showing {shown.length} of {formatNumber(props.rows.length)} rows
          </p>
        ) : null}
      </div>
    );
  },
};
