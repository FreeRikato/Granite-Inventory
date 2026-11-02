import { Input } from "@/components/ui/input";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL } from "@/lib/domain";
import { formatRupees } from "@/lib/format";
import { restAmount, restMode, setAmount, toggleMode, typedModes, type PaymentSplit } from "@/lib/payment-split";
import { cn } from "@/lib/utils";

export function PaymentModeChips({
  split,
  onChange,
}: {
  readonly split: PaymentSplit;
  readonly onChange: (split: PaymentSplit) => void;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2" role="group" aria-label="Payment Mode">
      {PAYMENT_MODES.map((m) => {
        const active = split.modes.includes(m);
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(toggleMode(split, m))}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium",
              active
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {PAYMENT_MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

export function PaymentAmounts({
  split,
  total,
  onChange,
  idPrefix,
}: {
  readonly split: PaymentSplit;
  readonly total: number;
  readonly onChange: (split: PaymentSplit) => void;
  readonly idPrefix: string;
}) {
  if (split.modes.length < 2) return null;
  const last = restMode(split);
  return (
    <div className="flex flex-col gap-2" data-testid="payment-amounts">
      {typedModes(split).map((m) => (
        <AmountRow key={m} id={`${idPrefix}-${m}`} label={PAYMENT_MODE_LABEL[m]}>
          <Input
            id={`${idPrefix}-${m}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            placeholder="0"
            value={split.amounts[m] ?? ""}
            onChange={(e) => onChange(setAmount(split, m, e.target.value))}
            className="h-10 text-right tabular"
          />
        </AmountRow>
      ))}
      <AmountRow id={`${idPrefix}-${last}`} label={PAYMENT_MODE_LABEL[last]} hint="the rest">
        <Input
          id={`${idPrefix}-${last}`}
          readOnly
          value={formatRupees(restAmount(split, total))}
          className="h-10 bg-muted text-right text-muted-foreground tabular"
        />
      </AmountRow>
    </div>
  );
}

function AmountRow({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex w-28 shrink-0 flex-col text-sm font-medium">
        {label}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
