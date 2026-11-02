"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type BarShapeProps, type TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { PAYMENT_MODE_LABEL } from "@/lib/domain";
import { formatRupees, formatRupeesAxis } from "@/lib/format";
import type { ReceivedRow } from "@/lib/query/reads";

export type ReceivedGrain = "week" | "month" | "day";

type ModeKey = "cash" | "upi" | "bank_transfer";

const config = {
  cash: { label: PAYMENT_MODE_LABEL.CASH, color: "var(--muted-foreground)" },
  upi: { label: PAYMENT_MODE_LABEL.UPI, color: "var(--chart-1)" },
  bank_transfer: { label: PAYMENT_MODE_LABEL.BANK_TRANSFER, color: "var(--chart-5)" },
} satisfies ChartConfig;

const MODES = (["cash", "upi", "bank_transfer"] as const).map((key) => ({ key, ...config[key] }));

const STUB_HEIGHT = 2;
const CORNER = 3;

function receivedAxisLabel(grain: ReceivedGrain, periodStart: string): string {
  return format(parseISO(periodStart), grain === "month" ? "MMM" : "d MMM");
}

function receivedPeriodTitle(grain: ReceivedGrain, periodStart: string): string {
  const date = parseISO(periodStart);
  if (grain === "week") return `Week of ${format(date, "d MMM yyyy")}`;
  if (grain === "month") return format(date, "MMMM yyyy");
  return format(date, "EEE, d MMM yyyy");
}

function topMode(row: ReceivedRow): ModeKey | null {
  for (const mode of [...MODES].reverse()) if (row[mode.key] > 0) return mode.key;
  return null;
}

function segmentShape(mode: ModeKey, color: string, rows: readonly ReceivedRow[]) {
  return function ReceivedSegment({ x, y, width, height, index }: BarShapeProps) {
    const row = rows[index];
    if (!row) return null;
    if (row.total === 0) {
      if (mode !== "cash") return null;
      return (
        <rect
          data-testid="received-stub"
          x={x}
          y={y - STUB_HEIGHT}
          width={width}
          height={STUB_HEIGHT}
          rx={1}
          fill="var(--chart-5)"
        />
      );
    }
    if (row[mode] <= 0 || height === 0) return null;
    const top = Math.min(y, y + height);
    const drawn = Math.abs(height);
    const r = Math.min(CORNER, drawn, width / 2);
    const path =
      topMode(row) === mode
        ? `M${x},${top + drawn} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + drawn} Z`
        : `M${x},${top} H${x + width} V${top + drawn} H${x} Z`;
    return (
      <path
        data-testid="received-segment"
        data-mode={mode}
        d={path}
        fill={color}
        stroke="var(--card)"
        strokeWidth={1}
      />
    );
  };
}

function ReceivedTooltip({
  rows,
  grain,
  active,
  label,
}: Pick<TooltipContentProps, "active" | "label"> & {
  readonly rows: readonly ReceivedRow[];
  readonly grain: ReceivedGrain;
}) {
  const row = rows.find((r) => r.period_start === label);
  if (!active || !row) return null;
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <span className="font-semibold">{receivedPeriodTitle(grain, row.period_start)}</span>
      {MODES.map((mode) => (
        <span key={mode.key} className="flex justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <i className="size-2 rounded-xs" style={{ background: mode.color }} />
            {mode.label}
          </span>
          <span className="font-semibold tabular">{formatRupees(row[mode.key])}</span>
        </span>
      ))}
      <span className="mt-0.5 flex justify-between gap-6 border-t border-border pt-1">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular">{formatRupees(row.total)}</span>
      </span>
    </div>
  );
}

export function ReceivedBars({
  rows,
  grain,
}: {
  readonly rows: readonly ReceivedRow[];
  readonly grain: ReceivedGrain;
}) {
  return (
    <div>
      <ChartContainer
        config={config}
        className="aspect-auto h-64 w-full"
        role="group"
        aria-label="Money received by Payment Mode"
        data-testid="received-chart"
      >
        <BarChart data={[...rows]} accessibilityLayer margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="period_start"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            tickFormatter={(v: string) => receivedAxisLabel(grain, v)}
          />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatRupeesAxis(v)} />
          <ChartTooltip
            cursor={false}
            content={({ active, label }) => <ReceivedTooltip rows={rows} grain={grain} active={active} label={label} />}
          />
          {MODES.map((mode) => (
            <Bar
              key={mode.key}
              dataKey={mode.key}
              stackId="received"
              shape={segmentShape(mode.key, mode.color, rows)}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="flex justify-center gap-4 pt-3 text-xs" data-testid="received-legend">
        {MODES.map((mode) => (
          <span key={mode.key} className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-xs" style={{ background: mode.color }} />
            {mode.label}
          </span>
        ))}
      </div>
    </div>
  );
}
