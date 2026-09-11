import Link from "next/link";
import { AgeingBanner } from "@/components/ageing-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDims } from "@/lib/format";
import type { YardBatch } from "@/lib/yard";
import { cn } from "@/lib/utils";

type Props = {
  readonly batch: YardBatch;
  readonly actions?: React.ReactNode;
};

/* One Batch in the yard: banner, names, the numbers, and the sell action. */
export function BatchCard({ batch, actions }: Props) {
  const stale = batch.ageing_band === "STALE";
  return (
    <article
      data-testid="yard-batch"
      data-batch-code={batch.batch_code}
      className={cn(
        "rounded-tile border bg-card p-4 shadow-sm",
        stale ? "border-stale/40" : "border-border",
        batch.sold_out && "opacity-60",
      )}
    >
      <div className={stale ? "mb-3" : "mb-2"}>
        <AgeingBanner band={batch.ageing_band} days={batch.age_days} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-bold">
          {batch.product_name} · {batch.variant_name}
        </h3>
        <span className="font-mono text-xs text-muted-foreground">{batch.batch_code}</span>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <Stat label="Dimensions" value={formatDims(batch.length_ft, batch.breadth_ft)} />
          {batch.thickness_mm !== null ? <Stat label="Thickness" value={`${batch.thickness_mm}mm`} /> : null}
          <Stat label="Bought" value={String(batch.initial_units ?? 0)} />
          <Stat label="Sold" value={String(batch.units_sold ?? 0)} />
          <Stat label="Present" value={String(batch.available ?? 0)} strong />
          <Stat label="On" value={batch.purchase_date ? formatDate(batch.purchase_date) : ""} />
          <Stat label="From" value={batch.supplier_name ?? ""} />
        </dl>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {!batch.sold_out && batch.id ? (
            <Button asChild variant="outline" size="sm" className="h-9 bg-card font-semibold">
              <Link href={`/sell?batch=${batch.id}`}>Sell from this Batch</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-1">
      <dt>{label}:</dt>
      <dd className={cn("font-semibold text-foreground tabular", strong && "text-primary")}>{value}</dd>
    </div>
  );
}
