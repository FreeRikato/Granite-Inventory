import { CUSTOMER_TYPE_LABEL, isCustomerType, type CustomerType } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TONE: Record<CustomerType, string> = {
  CONTRACTOR: "bg-ageing-soft text-ageing",
  REGULAR: "bg-accent text-accent-foreground",
  ENGINEER: "bg-stale-soft text-stale",
  TRUST: "bg-fresh-soft text-fresh",
  RETAIL: "bg-muted text-muted-foreground",
};

export function CustomerTypeBadge({ type, className }: { type: string | null; className?: string }) {
  const t: CustomerType = isCustomerType(type) ? type : "REGULAR";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-3 text-[11px] font-bold uppercase tracking-wide", TONE[t], className)}>
      {CUSTOMER_TYPE_LABEL[t]}
    </span>
  );
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
