import { CalendarClock } from "lucide-react";

/* The virtual yard clamp between two deliveries of the same Stock Line. */
export function Clamp({ days }: { readonly days: number }) {
  return (
    <div className="flex items-center gap-3 py-1" data-testid="clamp">
      <span className="h-px flex-1 bg-border" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />
        New batch arrived {days === 0 ? "the same day" : days === 1 ? "1 day later" : `${days} days later`}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
