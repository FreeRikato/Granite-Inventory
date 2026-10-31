import { PAYMENT_MODE_LABEL, type PaymentMode } from "@/lib/domain";
import { formatRupees } from "@/lib/format";
import type { PaymentInput } from "@/lib/schemas/sale";

export type PaymentSplit = {
  readonly modes: readonly [PaymentMode, ...PaymentMode[]];
  readonly amounts: Readonly<Partial<Record<PaymentMode, string>>>;
};

export type SplitCheck =
  | { readonly kind: "ok"; readonly payments: readonly PaymentInput[] }
  | { readonly kind: "refused"; readonly message: string };

const round2 = (value: number) => Math.round(value * 100) / 100;

export function singleMode(mode: PaymentMode): PaymentSplit {
  return { modes: [mode], amounts: {} };
}

export function splitFromPayments(
  payments: readonly { readonly paymentMode: PaymentMode; readonly amount: number }[],
): PaymentSplit {
  const [first, ...rest] = payments;
  if (first === undefined) return singleMode("CASH");
  const amounts: Partial<Record<PaymentMode, string>> = {};
  for (const p of payments) amounts[p.paymentMode] = String(p.amount);
  return { modes: [first.paymentMode, ...rest.map((p) => p.paymentMode)], amounts };
}

export function toggleMode(split: PaymentSplit, mode: PaymentMode): PaymentSplit {
  if (!split.modes.includes(mode)) return { ...split, modes: [...split.modes, mode] };
  const [first, ...rest] = split.modes.filter((m) => m !== mode);
  if (first === undefined) return split;
  return { ...split, modes: [first, ...rest] };
}

export function setAmount(split: PaymentSplit, mode: PaymentMode, amount: string): PaymentSplit {
  return { ...split, amounts: { ...split.amounts, [mode]: amount } };
}

export function typedModes(split: PaymentSplit): readonly PaymentMode[] {
  return split.modes.slice(0, -1);
}

export function restMode(split: PaymentSplit): PaymentMode {
  return split.modes[split.modes.length - 1] ?? split.modes[0];
}

export function restAmount(split: PaymentSplit, total: number): number {
  const typed = typedModes(split).reduce((sum, m) => sum + (Number(split.amounts[m]) || 0), 0);
  return round2(total - typed);
}

export function checkSplit(split: PaymentSplit, total: number): SplitCheck {
  if (split.modes.length === 1) return { kind: "ok", payments: [{ paymentMode: split.modes[0] }] };
  const payments: PaymentInput[] = [];
  for (const mode of typedModes(split)) {
    const raw = split.amounts[mode]?.trim() ?? "";
    if (raw === "") return { kind: "refused", message: `Enter an amount for ${PAYMENT_MODE_LABEL[mode]}` };
    const amount = round2(Number(raw));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { kind: "refused", message: "Each payment in a split must be more than zero" };
    }
    payments.push({ paymentMode: mode, amount });
  }
  const rest = restAmount(split, total);
  const last = restMode(split);
  if (rest <= 0) {
    return {
      kind: "refused",
      message: `Nothing is left for ${PAYMENT_MODE_LABEL[last]}: the other amounts already reach ${formatRupees(total)}`,
    };
  }
  return { kind: "ok", payments: [...payments, { paymentMode: last, amount: rest }] };
}

export function describePayments(
  payments: readonly { readonly paymentMode: PaymentMode; readonly amount: number }[],
): string {
  const [only] = payments;
  if (payments.length === 1 && only) return PAYMENT_MODE_LABEL[only.paymentMode];
  return payments.map((p) => `${PAYMENT_MODE_LABEL[p.paymentMode]} ${formatRupees(p.amount)}`).join(" + ");
}
