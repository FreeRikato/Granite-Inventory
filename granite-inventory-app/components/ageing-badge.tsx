import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAgeingBand, type AgeingBand } from "@/lib/domain";

const TONE: Record<AgeingBand, string> = {
  FRESH: "bg-fresh-soft text-fresh",
  AGEING: "bg-ageing-soft text-ageing",
  STALE: "bg-stale-soft text-stale",
};

export function bandOf(value: string | null | undefined): AgeingBand {
  return isAgeingBand(value) ? value : "FRESH";
}

/* Small chip: "232 days" coloured by band. */
export function AgeingBadge({ band, days, className }: { band: string | null; days: number | null; className?: string }) {
  const b = bandOf(band);
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold tabular", TONE[b], className)}>
      {days ?? 0} days
    </span>
  );
}

/* Full-width banner on a batch card: warning for stale, tag for fresh and ageing. */
export function AgeingBanner({ band, days }: { band: string | null; days: number | null }) {
  const b = bandOf(band);
  if (b === "STALE") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-stale-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stale">
        <AlertTriangle className="size-4" />
        Old stock warning · {days} days active
      </div>
    );
  }
  return (
    <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide", TONE[b])}>
      {b === "AGEING" ? `Ageing · ${days} days` : "New stock"}
    </span>
  );
}
