import { dueLabel, dueTone, owesLabel, type DueTone } from "@/lib/credit";
import { cn } from "@/lib/utils";

const TONE: Record<DueTone, string> = {
  far: "bg-fresh-soft text-fresh",
  soon: "bg-ageing-soft text-ageing",
  late: "bg-stale-soft text-stale",
};

const BASE = "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold";

export function DueBadge({ daysLeft, className }: { readonly daysLeft: number; readonly className?: string }) {
  return (
    <span className={cn(BASE, TONE[dueTone(daysLeft)], className)} data-testid="due-badge">
      {dueLabel(daysLeft)}
    </span>
  );
}

export function ExtendedTag({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return <span className={cn(BASE, "bg-muted text-muted-foreground")}>Extended {count}×</span>;
}

export function OwesBadge({
  owed,
  daysLeft,
  className,
}: {
  readonly owed: number;
  readonly daysLeft: number | null;
  readonly className?: string;
}) {
  const tone =
    daysLeft === null || dueTone(daysLeft) === "far" ? "bg-muted text-muted-foreground" : TONE[dueTone(daysLeft)];
  return (
    <span className={cn(BASE, tone, className)} data-testid="owes-badge">
      {owesLabel(owed, daysLeft)}
    </span>
  );
}
