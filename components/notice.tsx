import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  readonly tone?: "accent" | "warning" | "error" | "fresh";
  readonly icon?: "info" | "alert";
  readonly className?: string;
  readonly children: ReactNode;
};

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  accent: "border-primary/40 bg-accent text-accent-foreground",
  warning: "border-ageing/40 bg-ageing-soft text-ageing",
  error: "border-stale/40 bg-stale-soft text-stale",
  fresh: "border-fresh/40 bg-fresh-soft text-fresh",
};

/* Soft bordered message block from the design (the inward and sell side notes). */
export function Notice({ tone = "accent", icon = "info", className, children }: Props) {
  const Icon = icon === "alert" ? AlertCircle : Info;
  return (
    <div className={cn("flex gap-2.5 rounded-tile border px-4 py-3 text-sm", TONE[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
