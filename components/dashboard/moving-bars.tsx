import { formatNumber } from "@/lib/format";

type Row = { readonly label: string; readonly units: number };
type RankedRow = { readonly label: string; readonly value: number };

export function RankedBarList({ rows, label }: { readonly rows: readonly RankedRow[]; readonly label?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="flex flex-col gap-3" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[88px_1fr_40px] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right font-semibold tabular">{formatNumber(r.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export function MovingBars({ rows }: { readonly rows: readonly Row[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No sales in the last 90 days.</p>;
  }
  return <RankedBarList rows={rows.map((r) => ({ label: r.label, value: r.units }))} label="Units sold by size" />;
}
