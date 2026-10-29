import { cn } from "@/lib/utils";

type Option<V extends string> = { readonly value: V; readonly label: string };

export function SegmentedToggle<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly Option<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center rounded-full border px-3.5 text-xs font-medium",
            value === o.value
              ? "border-primary/40 bg-accent text-accent-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
