import { formatNumber } from "@/lib/format";

type Row = { readonly label: string; readonly units: number };

/* Units sold per size in the window, ranked. One series, so one hue and direct labels. */
export function MovingBars({ rows }: { readonly rows: readonly Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No sales in the last 90 days.</p>;
  }
  return (
    <ol className="flex flex-col gap-3" aria-label="Units sold by size">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[88px_1fr_40px] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (r.units / max) * 100)}%` }} />
          </span>
          <span className="text-right font-semibold tabular">{formatNumber(r.units)}</span>
        </li>
      ))}
    </ol>
  );
}
